import { addYearMonth, dateToMonth, statementDates, statementMonthFor, statementStatus } from "@miu/core";
import { and, type Db, eq, isNotNull, schema, sql } from "@miu/db";
import type { CardOverview, StatementSummary } from "@miu/shared";

const { transactions } = schema;

export type CardAccount = { id: string; closingDay: number; dueDay: number; creditLimitCents: number };

type Ledger = Map<string, { totalCents: number; plannedCents: number; paidCents: number }>;

/** Por fatura: compras − estornos (com previstos) e quanto já foi pago. */
export async function cardLedger(db: Db, userId: string, cardId: string): Promise<Ledger> {
  const [charges, payments] = await Promise.all([
    db
      .select({
        month: transactions.statementMonth,
        total: sql<string>`sum(case when ${transactions.kind} = 'expense' then ${transactions.amountCents} else -${transactions.amountCents} end)`,
        planned: sql<string>`coalesce(sum(case when ${transactions.kind} = 'expense' then ${transactions.amountCents} else -${transactions.amountCents} end) filter (where ${transactions.status} = 'planned'), 0)`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.accountId, cardId),
          sql`${transactions.kind} <> 'transfer'`,
          isNotNull(transactions.statementMonth),
        ),
      )
      .groupBy(transactions.statementMonth),
    db
      .select({ month: transactions.statementMonth, paid: sql<string>`sum(${transactions.amountCents})` })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.toAccountId, cardId),
          eq(transactions.kind, "transfer"),
          eq(transactions.status, "posted"),
          isNotNull(transactions.statementMonth),
        ),
      )
      .groupBy(transactions.statementMonth),
  ]);

  const ledger: Ledger = new Map();
  const get = (m: string) => {
    let row = ledger.get(m);
    if (!row) {
      row = { totalCents: 0, plannedCents: 0, paidCents: 0 };
      ledger.set(m, row);
    }
    return row;
  };
  for (const c of charges) {
    if (!c.month) continue;
    const row = get(dateToMonth(c.month));
    row.totalCents += Number(c.total);
    row.plannedCents += Number(c.planned);
  }
  for (const p of payments) {
    if (p.month) get(dateToMonth(p.month)).paidCents += Number(p.paid);
  }
  return ledger;
}

export function summarize(card: CardAccount, month: string, ledger: Ledger, today: string): StatementSummary {
  const { closeDate, dueDate } = statementDates(month, card.closingDay, card.dueDay);
  const row = ledger.get(month) ?? { totalCents: 0, plannedCents: 0, paidCents: 0 };
  const remainingCents = Math.max(0, row.totalCents - row.paidCents);
  return {
    month,
    closeDate,
    dueDate,
    status: statementStatus({ today, closeDate, dueDate, remainingCents }),
    totalCents: row.totalCents,
    plannedCents: row.plannedCents,
    paidCents: row.paidCents,
    remainingCents,
  };
}

/** Fatura mais antiga com saldo a pagar (antes da aberta); se não houver, a aberta. */
export function focusMonth(card: CardAccount, ledger: Ledger, today: string) {
  const open = statementMonthFor(today, card.closingDay);
  const owing = [...ledger.keys()]
    .filter((m) => m < open && summarize(card, m, ledger, today).remainingCents > 0)
    .sort();
  return owing[0] ?? open;
}

export async function cardOverview(
  db: Db,
  userId: string,
  card: CardAccount,
  balanceCents: number,
  today: string,
): Promise<CardOverview> {
  const [ledger, rows] = await Promise.all([
    cardLedger(db, userId, card.id),
    db
      .select({
        groupId: transactions.installmentGroupId,
        description: transactions.description,
        categoryId: transactions.categoryId,
        amount: transactions.amountCents,
        no: transactions.installmentNo,
        total: transactions.installmentTotal,
        month: transactions.statementMonth,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.accountId, card.id),
          isNotNull(transactions.installmentGroupId),
        ),
      ),
  ]);

  const open = statementMonthFor(today, card.closingDay);
  const pending = [...new Set([...ledger.keys(), open])]
    .filter((m) => m <= open)
    .sort()
    .map((m) => summarize(card, m, ledger, today))
    .filter((s) => s.month === open || s.remainingCents > 0);

  const groups = new Map<string, typeof rows>();
  for (const r of rows) if (r.groupId) groups.set(r.groupId, [...(groups.get(r.groupId) ?? []), r]);
  const installments = [...groups]
    .map(([groupId, list]) => {
      const future = list
        .filter((r) => r.month && dateToMonth(r.month) >= open)
        .sort((a, b) => (a.no ?? 0) - (b.no ?? 0));
      const last = list.reduce((a, b) => ((a.month ?? "") > (b.month ?? "") ? a : b));
      const first = future[0];
      if (!first) return null;
      return {
        groupId,
        description: first.description,
        categoryId: first.categoryId,
        perInstallmentCents: future.at(-1)?.amount ?? first.amount,
        nextNo: first.no ?? 1,
        total: first.total ?? list.length,
        remainingCents: future.reduce((s, r) => s + r.amount, 0),
        lastMonth: last.month ? dateToMonth(last.month) : open,
      };
    })
    .filter((x) => x !== null)
    .sort((a, b) => a.lastMonth.localeCompare(b.lastMonth));

  const usedCents = Math.max(0, -balanceCents);
  return {
    accountId: card.id,
    creditLimitCents: card.creditLimitCents,
    usedCents,
    availableCents: card.creditLimitCents - usedCents,
    openMonth: open,
    focusMonth: focusMonth(card, ledger, today),
    pending,
    upcoming: Array.from({ length: 6 }, (_, i) => {
      const m = addYearMonth(open, i);
      return { month: m, totalCents: ledger.get(m)?.totalCents ?? 0 };
    }),
    installments,
  };
}
