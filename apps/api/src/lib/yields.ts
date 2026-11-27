import { addDays, addYearMonth, annualFromDaily, daysInMonth, monthYield, todayIn } from "@miu/core";
import { and, type Db, eq, gte, isNotNull, isNull, lte, or, schema, sql } from "@miu/db";

const { accounts, transactions, cdiRates, yieldPostings, categories, userSettings } = schema;

/** API pública do Banco Central: CDI diário (% ao dia), série SGS 12. */
const BCB_CDI = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados";

export type Fetcher = (url: string) => Promise<Response>;

const br = (iso: string) => iso.split("-").reverse().join("/");
const fromBr = (d: string) => d.split("/").reverse().join("-");

/** Busca o CDI dos últimos dias no Banco Central e guarda (idempotente). Falha de rede não derruba a rotina. */
export async function syncCdi(db: Db, fetcher: Fetcher, today: string, days = 45) {
  const url = `${BCB_CDI}?formato=json&dataInicial=${br(addDays(today, -days))}&dataFinal=${br(today)}`;
  let rows: { data: string; valor: string }[];
  try {
    const res = await fetcher(url);
    if (!res.ok) return { saved: 0, erro: `bcb_${res.status}` };
    rows = (await res.json()) as { data: string; valor: string }[];
  } catch {
    return { saved: 0, erro: "bcb_rede" };
  }
  const values = rows
    .map((r) => ({ date: fromBr(r.data), ratePercent: Number(r.valor) }))
    .filter(
      (r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && Number.isFinite(r.ratePercent) && r.ratePercent >= 0,
    );
  if (values.length === 0) return { saved: 0 };
  await db
    .insert(cdiRates)
    .values(values)
    .onConflictDoUpdate({ target: cdiRates.date, set: { ratePercent: sql`excluded.rate_percent` } });
  return { saved: values.length };
}

const monthEnd = (m: string) =>
  `${m}-${String(daysInMonth(Number(m.slice(0, 4)), Number(m.slice(5, 7)))).padStart(2, "0")}`;

async function ratesFor(db: Db, month: string) {
  const rows = await db
    .select()
    .from(cdiRates)
    .where(and(gte(cdiRates.date, `${month}-01`), lte(cdiRates.date, monthEnd(month))));
  return Object.fromEntries(rows.map((r) => [r.date, r.ratePercent]));
}

/** CDI mais recente em % ao ano (para mostrar e estimar). */
export async function latestCdiAnnual(db: Db): Promise<number | null> {
  const [r] = await db.select().from(cdiRates).orderBy(sql`${cdiRates.date} desc`).limit(1);
  return r ? annualFromDaily(r.ratePercent) : null;
}

/** Saldo de abertura do mês e movimentos dentro dele, para uma conta (só o realizado). */
async function flows(
  db: Db,
  userId: string,
  accountId: string,
  initial: number,
  month: string,
  until: string,
) {
  const rows = await db
    .select({
      date: transactions.date,
      kind: transactions.kind,
      amount: transactions.amountCents,
      from: transactions.accountId,
      to: transactions.toAccountId,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.status, "posted"),
        lte(transactions.date, until),
        or(eq(transactions.accountId, accountId), eq(transactions.toAccountId, accountId)),
      ),
    );
  const delta = (r: (typeof rows)[number]) =>
    r.kind === "income"
      ? r.amount
      : r.kind === "expense"
        ? -r.amount
        : r.to === accountId
          ? r.amount
          : -r.amount;
  let opening = initial;
  const changes: { date: string; deltaCents: number }[] = [];
  for (const r of rows) {
    if (r.date < `${month}-01`) opening += delta(r);
    else changes.push({ date: r.date, deltaCents: delta(r) });
  }
  return { opening, changes };
}

type Box = { id: string; userId: string; initialBalanceCents: number; cdiPercent: number };

/** Rendimento da caixinha no mês (até `until`, se for o mês atual). */
export async function boxMonthYield(db: Db, box: Box, month: string, until?: string) {
  const end = until ?? monthEnd(month);
  const [{ opening, changes }, rates] = await Promise.all([
    flows(db, box.userId, box.id, box.initialBalanceCents, month, end),
    ratesFor(db, month),
  ]);
  return monthYield({ month, openingCents: opening, changes, rates, cdiPercent: box.cdiPercent, until: end });
}

/**
 * Rotina diária: lança o rendimento do mês que acabou em cada caixinha com % do CDI.
 * Idempotente (yield_postings único por conta+mês). Só lança se já houver CDI do mês guardado.
 */
export async function postYields(db: Db, now = new Date()) {
  const boxes = await db
    .select({
      id: accounts.id,
      userId: accounts.userId,
      initialBalanceCents: accounts.initialBalanceCents,
      cdiPercent: accounts.cdiPercent,
      timezone: userSettings.timezone,
    })
    .from(accounts)
    .leftJoin(userSettings, eq(userSettings.userId, accounts.userId))
    .where(and(isNotNull(accounts.cdiPercent), isNull(accounts.archivedAt)));
  let posted = 0;
  for (const b of boxes) {
    const today = todayIn(b.timezone ?? "America/Sao_Paulo", now);
    const month = addYearMonth(today.slice(0, 7), -1);
    const [done] = await db
      .select({ id: yieldPostings.id })
      .from(yieldPostings)
      .where(and(eq(yieldPostings.accountId, b.id), eq(yieldPostings.month, month)));
    if (done) continue;
    const rates = await ratesFor(db, month);
    if (Object.keys(rates).length === 0) continue; // ainda sem CDI do mês: tenta amanhã
    const amount = await boxMonthYield(db, { ...b, cdiPercent: b.cdiPercent as number }, month);
    // Reserva o mês antes de lançar: se duas rotinas rodarem juntas, só uma lança.
    const postingId = crypto.randomUUID();
    const reserved = await db
      .insert(yieldPostings)
      .values({ id: postingId, userId: b.userId, accountId: b.id, month, amountCents: amount })
      .onConflictDoNothing()
      .returning({ id: yieldPostings.id });
    if (reserved.length === 0 || amount <= 0) continue;
    const [cat] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(
          eq(categories.userId, b.userId),
          eq(categories.kind, "income"),
          eq(categories.name, "Rendimentos"),
        ),
      );
    const txId = crypto.randomUUID();
    await db.insert(transactions).values({
      id: txId,
      userId: b.userId,
      accountId: b.id,
      kind: "income",
      amountCents: amount,
      categoryId: cat?.id ?? null,
      date: monthEnd(month),
      description: `Rendimento de ${month.slice(5, 7)}/${month.slice(0, 4)} (${(b.cdiPercent as number) / 100}% do CDI)`,
      status: "posted",
      source: "manual",
    });
    await db.update(yieldPostings).set({ transactionId: txId }).where(eq(yieldPostings.id, postingId));
    posted++;
  }
  return { caixinhas: boxes.length, lancados: posted };
}

/** Rendimento parcial do mês atual de várias caixinhas (para mostrar "rendeu R$ X este mês"). */
export async function accruedThisMonth(db: Db, boxes: Box[], today: string) {
  const out = new Map<string, number>();
  await Promise.all(
    boxes.map(async (b) => out.set(b.id, await boxMonthYield(db, b, today.slice(0, 7), today))),
  );
  return out;
}

/**
 * CDI velho (mais de 5 dias) ou vazio: busca no Banco Central agora, sem esperar a rotina diária.
 * Só quando alguém tem caixinha que rende; falha de rede não atrapalha (a tela mostra o que tiver).
 */
export async function ensureFreshCdi(db: Db, fetcher: Fetcher, today: string) {
  const [box] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(isNotNull(accounts.cdiPercent))
    .limit(1);
  if (!box) return;
  const [last] = await db
    .select({ date: cdiRates.date })
    .from(cdiRates)
    .orderBy(sql`${cdiRates.date} desc`)
    .limit(1);
  if (last && last.date >= addDays(today, -5)) return;
  await syncCdi(db, fetcher, today);
}
