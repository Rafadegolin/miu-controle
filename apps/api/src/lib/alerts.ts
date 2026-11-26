import { addDays, formatBRL, statementMonthFor, todayIn } from "@miu/core";
import { and, type Db, eq, inArray, schema, sql } from "@miu/db";
import { budgetMonth } from "./budgets";
import { cardLedger, summarize } from "./cards";
import { alertsDigest, type DigestItem } from "./email-templates";
import type { Mailer } from "./mailer";

const { user, userSettings, accounts, categories, sentAlerts, budgets } = schema;

/** Teto de e-mails por execução (o plano grátis limita subrequests por invocação; o resto sai amanhã). */
const MAX_EMAILS_PER_RUN = 40;
const CARD_DUE_WARNING_DAYS = 3;

type Candidate = { key: string; item: DigestItem };

/** Avisos que valem para um usuário hoje (sem olhar se já foram enviados). */
export async function alertCandidates(db: Db, userId: string, today: string): Promise<Candidate[]> {
  const month = today.slice(0, 7);
  const [b, cats, cardRows] = await Promise.all([
    budgetMonth(db, userId, month, today),
    db
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .where(eq(categories.userId, userId)),
    db
      .select()
      .from(accounts)
      .where(
        and(
          eq(accounts.userId, userId),
          eq(accounts.kind, "credit_card"),
          sql`${accounts.archivedAt} is null`,
        ),
      ),
  ]);
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const out: Candidate[] = [];

  for (const line of b.lines) {
    if (line.status === "ok") continue;
    const name = catName.get(line.categoryId) ?? "Categoria";
    out.push({
      key: `budget:${line.categoryId}:${month}:${line.status}`,
      item:
        line.status === "over"
          ? {
              tone: "danger",
              title: `${name}: orçamento estourado`,
              detail: `Você gastou ${formatBRL(line.spentCents)} de ${formatBRL(line.limitCents)} este mês.`,
            }
          : {
              tone: "warning",
              title: `${name}: ${Math.round((line.spentCents / line.limitCents) * 100)}% do orçamento`,
              detail: `Restam ${formatBRL(line.limitCents - line.spentCents)} até o fim do mês.`,
            },
    });
  }

  for (const a of cardRows) {
    if (!a.closingDay || !a.dueDay) continue;
    const card = {
      id: a.id,
      closingDay: a.closingDay,
      dueDay: a.dueDay,
      creditLimitCents: a.creditLimitCents ?? 0,
    };
    const ledger = await cardLedger(db, userId, a.id);
    const open = statementMonthFor(today, card.closingDay);
    for (const m of [...ledger.keys()].filter((x) => x < open)) {
      const s = summarize(card, m, ledger, today);
      if (s.remainingCents <= 0) continue;
      if (s.status === "overdue") {
        out.push({
          key: `card:${a.id}:${m}:overdue`,
          item: {
            tone: "danger",
            title: `Fatura do ${a.name} vencida`,
            detail: `Faltam ${formatBRL(s.remainingCents)}. Venceu em ${s.dueDate.split("-").reverse().join("/")}.`,
          },
        });
      } else if (s.dueDate <= addDays(today, CARD_DUE_WARNING_DAYS)) {
        out.push({
          key: `card:${a.id}:${m}:due`,
          item: {
            tone: "warning",
            title: `Fatura do ${a.name} vence ${s.dueDate === today ? "hoje" : `em ${s.dueDate.split("-").reverse().join("/")}`}`,
            detail: `Valor a pagar: ${formatBRL(s.remainingCents)}.`,
          },
        });
      }
    }
  }
  return out;
}

/**
 * Rotina diária de avisos: um e-mail por pessoa, juntando tudo o que é novo
 * (orçamento em 80%/estourado, fatura vencendo em até 3 dias ou vencida). Cada aviso sai uma vez só.
 */
export async function runAlerts(db: Db, mailer: Mailer, appUrl: string, now = new Date()) {
  // Só quem tem algo que possa gerar aviso: orçamento ou cartão.
  const people = await db
    .select({
      id: user.id,
      email: user.email,
      name: user.name,
      tz: userSettings.timezone,
      enabled: userSettings.emailAlerts,
    })
    .from(user)
    .leftJoin(userSettings, eq(userSettings.userId, user.id))
    .where(
      and(
        eq(user.emailVerified, true),
        sql`(${user.id} in (select ${budgets.userId} from ${budgets}) or ${user.id} in (select ${accounts.userId} from ${accounts} where ${accounts.kind} = 'credit_card'))`,
      ),
    );

  let sent = 0;
  for (const p of people) {
    if (sent >= MAX_EMAILS_PER_RUN) break;
    if (p.enabled === false) continue;
    const today = todayIn(p.tz ?? "America/Sao_Paulo", now);
    const candidates = await alertCandidates(db, p.id, today);
    if (candidates.length === 0) continue;
    const already = await db
      .select({ key: sentAlerts.key })
      .from(sentAlerts)
      .where(
        and(
          eq(sentAlerts.userId, p.id),
          inArray(
            sentAlerts.key,
            candidates.map((c) => c.key),
          ),
        ),
      );
    const done = new Set(already.map((a) => a.key));
    // "Estourou" substitui "atenção" da mesma categoria no mesmo mês.
    const fresh = candidates.filter((c) => !done.has(c.key));
    if (fresh.length === 0) continue;
    try {
      await mailer.send(
        alertsDigest(
          p.email,
          p.name,
          fresh.map((f) => f.item),
          appUrl,
        ),
      );
      await db
        .insert(sentAlerts)
        .values(fresh.map((f) => ({ userId: p.id, key: f.key })))
        .onConflictDoNothing();
      sent++;
    } catch (err) {
      // Não marca como enviado: tenta de novo amanhã.
      console.error("alerta_falhou", { userId: p.id, err });
    }
  }
  return { emailsSent: sent };
}
