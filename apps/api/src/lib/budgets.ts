import { addYearMonth, budgetStatus, dailyAllowance, monthToDate, suggestLimit } from "@miu/core";
import { and, type Db, desc, eq, gte, isNull, lt, lte, schema, sql } from "@miu/db";
import type { BudgetLine, BudgetMonth } from "@miu/shared";
import { userToday } from "./user-data";

const { budgets, transactions, categories } = schema;

/** Orçamentos do mês com gasto, situação, quanto dá por dia e sugestões. Usado pela tela e pelos avisos. */
export async function budgetMonth(
  db: Db,
  userId: string,
  month: string,
  today?: string,
): Promise<BudgetMonth> {
  const from = monthToDate(month);
  const to = monthToDate(addYearMonth(month, 1));
  const avgFrom = monthToDate(addYearMonth(month, -3));

  const [limits, spending, history, expenseCats, todayStr] = await Promise.all([
    // limite vigente de cada categoria: a linha mais recente com validFrom <= mês
    db
      .selectDistinctOn([budgets.categoryId], {
        categoryId: budgets.categoryId,
        amountCents: budgets.amountCents,
      })
      .from(budgets)
      .where(and(eq(budgets.userId, userId), lte(budgets.validFrom, from)))
      .orderBy(budgets.categoryId, desc(budgets.validFrom)),
    db
      .select({
        categoryId: transactions.categoryId,
        posted: sql<string>`coalesce(sum(${transactions.amountCents}) filter (where ${transactions.status} = 'posted'), 0)`,
        planned: sql<string>`coalesce(sum(${transactions.amountCents}) filter (where ${transactions.status} = 'planned'), 0)`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.kind, "expense"),
          gte(transactions.date, from),
          lt(transactions.date, to),
        ),
      )
      .groupBy(transactions.categoryId),
    db
      .select({ categoryId: transactions.categoryId, total: sql<string>`sum(${transactions.amountCents})` })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.kind, "expense"),
          eq(transactions.status, "posted"),
          gte(transactions.date, avgFrom),
          lt(transactions.date, from),
        ),
      )
      .groupBy(transactions.categoryId),
    db
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(eq(categories.userId, userId), eq(categories.kind, "expense"), isNull(categories.archivedAt)),
      ),
    today ? Promise.resolve(today) : userToday(db, userId),
  ]).then(([a, b, c, d, t]) => [a, b, c, d, t] as const);

  const spent = new Map(
    spending.map((s) => [s.categoryId, { posted: Number(s.posted), planned: Number(s.planned) }]),
  );
  const lines: BudgetLine[] = limits
    .filter((l): l is { categoryId: string; amountCents: number } => l.amountCents !== null)
    .map((l) => {
      const s = spent.get(l.categoryId) ?? { posted: 0, planned: 0 };
      return {
        categoryId: l.categoryId,
        limitCents: l.amountCents,
        spentCents: s.posted,
        plannedCents: s.planned,
        status: budgetStatus(s.posted, l.amountCents),
        dailyAllowanceCents: dailyAllowance(l.amountCents - s.posted - s.planned, month, todayStr),
      };
    })
    .sort((a, b) => b.spentCents / b.limitCents - a.spentCents / a.limitCents);

  const totals = lines.reduce(
    (t, l) => ({
      limitCents: t.limitCents + l.limitCents,
      spentCents: t.spentCents + l.spentCents,
      plannedCents: t.plannedCents + l.plannedCents,
    }),
    { limitCents: 0, spentCents: 0, plannedCents: 0 },
  );
  const withBudget = new Set(lines.map((l) => l.categoryId));
  const avg = new Map(history.map((h) => [h.categoryId, Number(h.total) / 3]));

  const body: BudgetMonth = {
    month,
    lines,
    totals: { ...totals, status: budgetStatus(totals.spentCents, totals.limitCents) },
    dailyAllowanceCents: lines.length
      ? dailyAllowance(totals.limitCents - totals.spentCents - totals.plannedCents, month, todayStr)
      : null,
    suggestions: expenseCats
      .filter((cat) => !withBudget.has(cat.id))
      .map((cat) => {
        const averageCents = Math.round(avg.get(cat.id) ?? 0);
        return { categoryId: cat.id, averageCents, suggestedCents: suggestLimit(averageCents) };
      })
      .sort((a, b) => b.averageCents - a.averageCents),
  };
  return body;
}
