import { addDays, monthToDate, occurrencesBetween, statementMonthFor, todayIn } from "@miu/core";
import { and, type Db, eq, gte, inArray, isNull, lte, or, schema, sql } from "@miu/db";

const { recurringRules, transactions, accounts, userSettings } = schema;
type Rule = typeof recurringRules.$inferSelect;

/** Até quantos dias à frente os previstos ficam gerados. */
export const HORIZON_DAYS = 45;

type CardDays = Map<string, number>; // accountId → dia de fechamento

async function cardClosingDays(db: Db, accountIds: string[]): Promise<CardDays> {
  if (accountIds.length === 0) return new Map();
  const rows = await db
    .select({ id: accounts.id, closingDay: accounts.closingDay })
    .from(accounts)
    .where(and(inArray(accounts.id, [...new Set(accountIds)]), eq(accounts.kind, "credit_card")));
  return new Map(rows.filter((r) => r.closingDay !== null).map((r) => [r.id, r.closingDay as number]));
}

/**
 * Cria as ocorrências que faltam de cada regra, de `generatedUntil` (ou do início) até `horizon`.
 * Idempotente: o índice único (regra, data) impede duplicar, então rodar de novo é seguro.
 * Ocorrências passadas que ficaram para trás (o agendamento não rodou) também entram: catch-up.
 */
export async function generateOccurrences(db: Db, rules: Rule[], today: (userId: string) => string) {
  const active = rules.filter((r) => !r.pausedAt);
  if (active.length === 0) return 0;
  const closing = await cardClosingDays(
    db,
    active.map((r) => r.accountId),
  );
  const rows: (typeof transactions.$inferInsert)[] = [];
  const updates: { id: string; until: string }[] = [];

  for (const r of active) {
    const t = today(r.userId);
    const horizon = addDays(t, HORIZON_DAYS);
    const from = r.generatedUntil ? addDays(r.generatedUntil, 1) : r.startDate;
    if (from > horizon) continue;
    const dates = occurrencesBetween(
      {
        frequency: r.frequency,
        interval: r.interval,
        startDate: r.startDate,
        endDate: r.endDate,
        dayOfMonth: r.dayOfMonth,
      },
      from,
      horizon,
    );
    const closingDay = closing.get(r.accountId);
    for (const date of dates) {
      rows.push({
        id: crypto.randomUUID(),
        userId: r.userId,
        kind: r.kind,
        amountCents: r.amountCents,
        accountId: r.accountId,
        toAccountId: r.toAccountId,
        categoryId: r.kind === "transfer" ? null : r.categoryId,
        date,
        description: r.description,
        status: r.autoPost && date <= t ? "posted" : "planned",
        source: "recurring",
        recurringRuleId: r.id,
        statementMonth: closingDay ? monthToDate(statementMonthFor(date, closingDay)) : null,
      });
    }
    updates.push({ id: r.id, until: horizon });
  }

  for (let i = 0; i < rows.length; i += 500) {
    await db
      .insert(transactions)
      .values(rows.slice(i, i + 500))
      .onConflictDoNothing();
  }
  if (updates.length) {
    // um UPDATE só para todas as regras
    const cases = sql.join(
      updates.map((u) => sql`when ${u.id} then ${u.until}::date`),
      sql` `,
    );
    await db
      .update(recurringRules)
      .set({ generatedUntil: sql`(case ${recurringRules.id} ${cases} end)` })
      .where(
        inArray(
          recurringRules.id,
          updates.map((u) => u.id),
        ),
      );
  }
  return rows.length;
}

/** Apaga as previsões futuras (ainda não confirmadas) de uma regra e gera de novo com os dados atuais. */
export async function regenerateRule(db: Db, rule: Rule, today: string) {
  await db
    .delete(transactions)
    .where(
      and(
        eq(transactions.recurringRuleId, rule.id),
        eq(transactions.status, "planned"),
        gte(transactions.date, today),
      ),
    );
  const until = addDays(today, -1);
  const reset = { ...rule, generatedUntil: rule.startDate > until ? null : until };
  await db
    .update(recurringRules)
    .set({ generatedUntil: reset.generatedUntil })
    .where(eq(recurringRules.id, rule.id));
  return generateOccurrences(db, [reset], () => today);
}

/**
 * Rotina diária (Cron Trigger):
 * 1. gera o que falta de todas as regras ativas até o horizonte;
 * 2. regras "lançar sozinho": previstos com data até hoje viram realizados.
 * Poucas queries no total, para caber no limite de subrequests do plano grátis.
 */
export async function runDaily(db: Db, now = new Date()) {
  const tzRows = await db
    .select({ userId: userSettings.userId, tz: userSettings.timezone })
    .from(userSettings);
  const tz = new Map(tzRows.map((r) => [r.userId, r.tz]));
  const today = (userId: string) => todayIn(tz.get(userId) ?? "America/Sao_Paulo", now);
  const latestHorizon = addDays(todayIn("Pacific/Kiritimati", now), HORIZON_DAYS);

  const pending = await db
    .select()
    .from(recurringRules)
    .where(
      and(
        isNull(recurringRules.pausedAt),
        or(isNull(recurringRules.generatedUntil), lte(recurringRules.generatedUntil, latestHorizon)),
      ),
    );
  const created = await generateOccurrences(db, pending, today);

  // Datas comparadas no fuso de cada usuário.
  const posted = await db.execute(sql`
    update ${transactions} t
    set status = 'posted', updated_at = now()
    from ${recurringRules} r
    left join ${userSettings} s on s.user_id = r.user_id
    where t.recurring_rule_id = r.id
      and r.auto_post = true
      and r.paused_at is null
      and t.status = 'planned'
      and t.date <= (${now.toISOString()}::timestamptz at time zone coalesce(s.timezone, 'America/Sao_Paulo'))::date
  `);
  return {
    created,
    autoPosted: Number(
      (posted as { count?: number; rowCount?: number }).count ??
        (posted as { rowCount?: number }).rowCount ??
        0,
    ),
  };
}
