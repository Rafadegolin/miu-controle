import { addDays, formatBRL, statementMonthFor, todayIn } from "@miu/core";
import { and, type Db, eq, inArray, schema, sql } from "@miu/db";
import { budgetMonth } from "./budgets";
import { cardLedger, summarize } from "./cards";
import { alertsDigest, type DigestItem } from "./email-templates";
import type { Mailer } from "./mailer";
import { sendToUser } from "./push";
import type { PushMessage, PushSender } from "./web-push";

const { user, userSettings, accounts, categories, sentAlerts, budgets, pushSubscriptions, transactions } =
  schema;

/** Teto de e-mails por execução (o plano grátis limita subrequests por invocação; o resto sai amanhã). */
const MAX_EMAILS_PER_RUN = 40;
/** Teto de pessoas notificadas por push por execução (cada aparelho é um subrequest). */
const MAX_PUSH_PER_RUN = 30;
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

/** Tela que o aviso abre ao tocar na notificação. */
const alertUrl = (key: string) => (key.startsWith("budget:") ? "/orcamentos" : "/cartoes");

/** Um aviso vira a própria notificação; vários viram uma só, com os títulos no corpo. */
export function alertPush(fresh: Candidate[]): PushMessage {
  const [first] = fresh;
  if (fresh.length === 1 && first) {
    return { title: first.item.title, body: first.item.detail, url: alertUrl(first.key), tag: "avisos" };
  }
  const urls = new Set(fresh.map((f) => alertUrl(f.key)));
  return {
    title: `${fresh.length} avisos do Miu`,
    body: fresh.map((f) => f.item.title).join(" · "),
    url: urls.size === 1 ? [...urls][0] : "/inicio",
    tag: "avisos",
  };
}

/**
 * Rotina diária de avisos (orçamento em 80%/estourado, fatura vencendo em até 3 dias ou vencida).
 * Por e-mail, um por pessoa juntando tudo o que é novo; por push, nos aparelhos ativados.
 * Os canais são independentes e cada aviso sai uma vez só em cada um.
 */
export async function runAlerts(
  db: Db,
  mailer: Mailer,
  appUrl: string,
  now = new Date(),
  push: PushSender | null = null,
) {
  // Só quem tem algo que possa gerar aviso: orçamento ou cartão.
  const people = await db
    .select({
      id: user.id,
      email: user.email,
      name: user.name,
      tz: userSettings.timezone,
      enabled: userSettings.emailAlerts,
      pushEnabled: userSettings.pushAlerts,
    })
    .from(user)
    .leftJoin(userSettings, eq(userSettings.userId, user.id))
    .where(
      and(
        eq(user.emailVerified, true),
        sql`(${user.id} in (select ${budgets.userId} from ${budgets}) or ${user.id} in (select ${accounts.userId} from ${accounts} where ${accounts.kind} = 'credit_card'))`,
      ),
    );
  const withDevices = push
    ? new Set(
        (await db.selectDistinct({ userId: pushSubscriptions.userId }).from(pushSubscriptions)).map(
          (r) => r.userId,
        ),
      )
    : new Set<string>();

  let sent = 0;
  let pushed = 0;
  for (const p of people) {
    const wantsEmail = p.enabled !== false && sent < MAX_EMAILS_PER_RUN;
    const wantsPush =
      Boolean(push) && p.pushEnabled !== false && withDevices.has(p.id) && pushed < MAX_PUSH_PER_RUN;
    if (!wantsEmail && !wantsPush) continue;
    const today = todayIn(p.tz ?? "America/Sao_Paulo", now);
    const candidates = await alertCandidates(db, p.id, today);
    if (candidates.length === 0) continue;
    const already = await db
      .select({ key: sentAlerts.key })
      .from(sentAlerts)
      .where(
        and(
          eq(sentAlerts.userId, p.id),
          inArray(sentAlerts.key, [
            ...candidates.map((c) => c.key),
            ...candidates.map((c) => `push:${c.key}`),
          ]),
        ),
      );
    const done = new Set(already.map((a) => a.key));

    const freshEmail = wantsEmail ? candidates.filter((c) => !done.has(c.key)) : [];
    if (freshEmail.length) {
      try {
        await mailer.send(
          alertsDigest(
            p.email,
            p.name,
            freshEmail.map((f) => f.item),
            `${appUrl}/inicio`,
          ),
        );
        await db
          .insert(sentAlerts)
          .values(freshEmail.map((f) => ({ userId: p.id, key: f.key })))
          .onConflictDoNothing();
        sent++;
      } catch (err) {
        // Não marca como enviado: tenta de novo amanhã.
        console.error("alerta_falhou", { userId: p.id, err });
      }
    }

    const freshPush = wantsPush && push ? candidates.filter((c) => !done.has(`push:${c.key}`)) : [];
    if (freshPush.length && push) {
      const r = await sendToUser(db, push, p.id, alertPush(freshPush));
      pushed++;
      // Marca se chegou em pelo menos um aparelho; senão, tenta de novo amanhã.
      if (r.sent > 0) {
        await db
          .insert(sentAlerts)
          .values(freshPush.map((f) => ({ userId: p.id, key: `push:${f.key}` })))
          .onConflictDoNothing();
      }
    }
  }
  return { emailsSent: sent, pushed };
}

/**
 * Lembrete à noite (opcional): "Lançou tudo hoje?" para quem ligou o lembrete, tem aparelho
 * ativado e não lançou nada no dia (no fuso dela). Uma vez por dia.
 */
export async function runReminders(db: Db, push: PushSender | null, now = new Date()) {
  if (!push) return { reminded: 0 };
  const people = await db
    .select({ id: userSettings.userId, tz: userSettings.timezone })
    .from(userSettings)
    .where(
      and(
        eq(userSettings.pushReminder, true),
        sql`${userSettings.userId} in (select ${pushSubscriptions.userId} from ${pushSubscriptions})`,
      ),
    );
  let reminded = 0;
  for (const p of people) {
    if (reminded >= MAX_PUSH_PER_RUN) break;
    const tz = p.tz ?? "America/Sao_Paulo";
    const today = todayIn(tz, now);
    const key = `push:reminder:${today}`;
    const [already] = await db
      .select({ key: sentAlerts.key })
      .from(sentAlerts)
      .where(and(eq(sentAlerts.userId, p.id), eq(sentAlerts.key, key)));
    if (already) continue;
    const [{ n } = { n: 0 }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, p.id),
          sql`(${transactions.createdAt} at time zone ${tz})::date = ${today}::date`,
        ),
      );
    if (n > 0) continue;
    const r = await sendToUser(db, push, p.id, {
      title: "Lançou tudo hoje?",
      body: "Leva 5 segundos: toque aqui e anote o que gastou.",
      url: "/inicio?novo=gasto",
      tag: "lembrete",
    });
    if (r.sent > 0) {
      await db.insert(sentAlerts).values({ userId: p.id, key }).onConflictDoNothing();
      reminded++;
    }
  }
  return { reminded };
}
