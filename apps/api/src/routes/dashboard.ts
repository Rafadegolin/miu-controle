import { addDays, addYearMonth, makeDate, monthToDate, statementMonthFor } from "@miu/core";
import { and, asc, desc, eq, gte, lt, lte, schema, sql } from "@miu/db";
import {
  type CashflowMonth,
  type CategoryReport,
  cashflowQuery,
  type Dashboard,
  type UpcomingItem,
  yearMonth,
} from "@miu/shared";
import { Hono } from "hono";
import { z } from "zod";
import type { App } from "../env";
import { cardLedger, summarize } from "../lib/cards";
import { buildProjection } from "../lib/projection";
import { accountBalances, userToday } from "../lib/user-data";
import { valid } from "../lib/validate";
import { requireUser } from "../middleware/auth";
import { toTransactionDto } from "./transactions";

const { accounts, transactions, goals } = schema;
const UPCOMING_DAYS = 15;

const monthEndOf = (month: string) => makeDate(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 31);

export const dashboardRoutes = new Hono<App>()
  .use(requireUser)
  /** Tudo do Início numa request só, com as consultas em paralelo. */
  .get("/", async (c) => {
    const db = c.var.db();
    const userId = c.var.user.id;
    const today = await userToday(db, userId);
    const month = today.slice(0, 7);
    const from = monthToDate(month);
    const to = monthToDate(addYearMonth(month, 1));
    const monthEnd = monthEndOf(month);
    const horizon = addDays(today, UPCOMING_DAYS);
    // biome-ignore lint/complexity/useMathMinMax: comparação de datas ISO (strings)
    const plannedUntil = horizon > monthEnd ? horizon : monthEnd;

    const prevFrom = monthToDate(addYearMonth(month, -1));
    const [accountRows, balances, totals, byCat, planned, recent, prevTotals, goalRows] = await Promise.all([
      db.select().from(accounts).where(eq(accounts.userId, userId)),
      accountBalances(db, userId),
      db
        .select({
          kind: transactions.kind,
          status: transactions.status,
          total: sql<string>`sum(${transactions.amountCents})`,
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, userId),
            gte(transactions.date, from),
            lt(transactions.date, to),
            sql`${transactions.kind} <> 'transfer'`,
          ),
        )
        .groupBy(transactions.kind, transactions.status),
      db
        .select({ categoryId: transactions.categoryId, total: sql<string>`sum(${transactions.amountCents})` })
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, userId),
            eq(transactions.kind, "expense"),
            gte(transactions.date, from),
            lt(transactions.date, to),
          ),
        )
        .groupBy(transactions.categoryId)
        .orderBy(desc(sql`sum(${transactions.amountCents})`))
        .limit(6),
      // previstos até o fim do mês / próximos dias, incluindo os atrasados
      db
        .select()
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, userId),
            eq(transactions.status, "planned"),
            lte(transactions.date, plannedUntil),
          ),
        )
        .orderBy(asc(transactions.date)),
      db
        .select()
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, userId),
            eq(transactions.status, "posted"),
            lte(transactions.date, today),
          ),
        )
        .orderBy(desc(transactions.date), desc(transactions.createdAt))
        .limit(6),
      db
        .select({ kind: transactions.kind, total: sql<string>`sum(${transactions.amountCents})` })
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, userId),
            gte(transactions.date, prevFrom),
            lt(transactions.date, from),
            sql`${transactions.kind} <> 'transfer'`,
          ),
        )
        .groupBy(transactions.kind),
      db
        .select({
          id: goals.id,
          name: goals.name,
          color: goals.color,
          targetCents: goals.targetCents,
          targetDate: goals.targetDate,
          // Colunas qualificadas à mão: dentro de subconsulta o Drizzle não prefixa a tabela.
          saved: sql<string>`coalesce((select sum(gc.amount_cents) from goal_contributions gc where gc.goal_id = goals.id), 0)`,
        })
        .from(goals)
        .where(and(eq(goals.userId, userId), sql`${goals.archivedAt} is null`)),
    ]);

    const active = accountRows.filter((a) => !a.archivedAt);
    const isCard = new Map(accountRows.map((a) => [a.id, a.kind === "credit_card"]));
    const balanceOf = (id: string, initial: number) => initial + (balances.get(id) ?? 0);
    const bankBalanceCents = active
      .filter((a) => a.kind !== "credit_card")
      .reduce((s, a) => s + balanceOf(a.id, a.initialBalanceCents), 0);

    // Faturas: a que pede atenção em cada cartão + as que vencem até o fim do mês.
    const cardRows = active.filter((a) => a.kind === "credit_card" && a.closingDay && a.dueDay);
    const ledgers = await Promise.all(cardRows.map((a) => cardLedger(db, userId, a.id)));
    let cardsDueThisMonthCents = 0;
    const cards: Dashboard["cards"] = [];
    const upcoming: UpcomingItem[] = [];
    cardRows.forEach((a, i) => {
      const card = {
        id: a.id,
        closingDay: a.closingDay as number,
        dueDay: a.dueDay as number,
        creditLimitCents: a.creditLimitCents ?? 0,
      };
      const ledger = ledgers[i] ?? new Map();
      const open = statementMonthFor(today, card.closingDay);
      const months = [...new Set([...ledger.keys(), open])].filter((m) => m <= open).sort();
      const pending = months
        .map((m) => summarize(card, m, ledger, today))
        .filter((s) => s.month === open || s.remainingCents > 0);
      for (const s of pending) {
        if (s.remainingCents > 0 && s.dueDate <= monthEnd) cardsDueThisMonthCents += s.remainingCents;
        if (s.remainingCents > 0 && s.dueDate <= horizon) {
          upcoming.push({ type: "statement", date: s.dueDate, accountId: a.id, statement: s });
        }
      }
      const focus =
        pending.find((s) => s.month < open && s.remainingCents > 0) ?? pending.find((s) => s.month === open);
      if (focus) {
        const used = Math.max(0, -balanceOf(a.id, a.initialBalanceCents));
        cards.push({ accountId: a.id, statement: focus, availableCents: card.creditLimitCents - used });
      }
    });

    // Saldo previsto: só o que passa pelas contas. Compras previstas no cartão já entram pela fatura;
    // transferências entre contas não mudam o total.
    let plannedNet = 0;
    for (const t of planned) {
      if (t.date > monthEnd || t.kind === "transfer" || isCard.get(t.accountId)) continue;
      plannedNet += t.kind === "income" ? t.amountCents : -t.amountCents;
    }
    for (const t of planned) {
      if (t.date > horizon || isCard.get(t.accountId)) continue;
      upcoming.push({ type: "transaction", date: t.date, transaction: toTransactionDto(t) });
    }
    upcoming.sort((a, b) => a.date.localeCompare(b.date));

    const projection = await buildProjection(db, userId, 1);
    const sum = (kind: string, status: string) =>
      Number(totals.find((r) => r.kind === kind && r.status === status)?.total ?? 0);

    const body: Dashboard = {
      today,
      month,
      bankBalanceCents,
      // Mesma conta da projeção das contas (lib/projection.ts): os números batem entre as telas.
      projectedEndCents:
        projection.months[0]?.totalCents ?? bankBalanceCents + plannedNet - cardsDueThisMonthCents,
      cardsDueThisMonthCents,
      totals: {
        incomePostedCents: sum("income", "posted"),
        incomePlannedCents: sum("income", "planned"),
        expensePostedCents: sum("expense", "posted"),
        expensePlannedCents: sum("expense", "planned"),
      },
      previousTotals: {
        incomeCents: Number(prevTotals.find((r) => r.kind === "income")?.total ?? 0),
        expenseCents: Number(prevTotals.find((r) => r.kind === "expense")?.total ?? 0),
      },
      topCategories: byCat.map((r) => ({ categoryId: r.categoryId, totalCents: Number(r.total) })),
      goalHighlight: pickGoal(goalRows),
      cards,
      upcoming: upcoming.slice(0, 12),
      recent: recent.map(toTransactionDto),
    };
    c.header("Cache-Control", "private, no-store");
    return c.json(body);
  });

export const reportsRoutes = new Hono<App>()
  .use(requireUser)
  /** Receitas e despesas mês a mês (realizado + previsto, previsto separado). */
  .get("/cashflow", valid("query", cashflowQuery), async (c) => {
    const { end, months } = c.req.valid("query");
    const db = c.var.db();
    const start = addYearMonth(end, -(months - 1));
    const rows = await db
      .select({
        month: sql<string>`to_char(${transactions.date}, 'YYYY-MM')`,
        kind: transactions.kind,
        total: sql<string>`sum(${transactions.amountCents})`,
        planned: sql<string>`coalesce(sum(${transactions.amountCents}) filter (where ${transactions.status} = 'planned'), 0)`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, c.var.user.id),
          sql`${transactions.kind} <> 'transfer'`,
          gte(transactions.date, monthToDate(start)),
          lt(transactions.date, monthToDate(addYearMonth(end, 1))),
        ),
      )
      .groupBy(sql`1`, transactions.kind);
    const body: CashflowMonth[] = Array.from({ length: months }, (_, i) => {
      const m = addYearMonth(start, i);
      const inc = rows.find((r) => r.month === m && r.kind === "income");
      const exp = rows.find((r) => r.month === m && r.kind === "expense");
      return {
        month: m,
        incomeCents: Number(inc?.total ?? 0),
        expenseCents: Number(exp?.total ?? 0),
        plannedIncomeCents: Number(inc?.planned ?? 0),
        plannedExpenseCents: Number(exp?.planned ?? 0),
      };
    });
    return c.json(body);
  })
  /** Gastos por categoria no mês, com a média dos 3 meses anteriores para comparar. */
  .get("/categories", valid("query", z.object({ month: yearMonth })), async (c) => {
    const { month } = c.req.valid("query");
    const db = c.var.db();
    const from = monthToDate(month);
    const rows = await db
      .select({
        categoryId: transactions.categoryId,
        current: sql<string>`coalesce(sum(${transactions.amountCents}) filter (where ${transactions.date} >= ${from}), 0)`,
        previous: sql<string>`coalesce(sum(${transactions.amountCents}) filter (where ${transactions.date} < ${from}), 0)`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, c.var.user.id),
          eq(transactions.kind, "expense"),
          gte(transactions.date, monthToDate(addYearMonth(month, -3))),
          lt(transactions.date, monthToDate(addYearMonth(month, 1))),
        ),
      )
      .groupBy(transactions.categoryId);
    const list = rows
      .map((r) => ({
        categoryId: r.categoryId,
        totalCents: Number(r.current),
        averageCents: Math.round(Number(r.previous) / 3),
      }))
      .filter((r) => r.totalCents > 0 || r.averageCents > 0)
      .sort((a, b) => b.totalCents - a.totalCents);
    const body: CategoryReport = {
      month,
      totalExpenseCents: list.reduce((s, r) => s + r.totalCents, 0),
      rows: list,
    };
    return c.json(body);
  });

/** Meta ativa ainda não concluída mais perto do fim (maior progresso). */
function pickGoal(
  rows: {
    id: string;
    name: string;
    color: string;
    targetCents: number;
    targetDate: string | null;
    saved: string;
  }[],
): Dashboard["goalHighlight"] {
  const open = rows
    .map((g) => ({ ...g, savedCents: Number(g.saved) }))
    .filter((g) => g.savedCents < g.targetCents)
    .sort((a, b) => b.savedCents / b.targetCents - a.savedCents / a.targetCents);
  const g = open[0] ?? null;
  return g
    ? {
        id: g.id,
        name: g.name,
        color: g.color,
        savedCents: g.savedCents,
        targetCents: g.targetCents,
        targetDate: g.targetDate,
      }
    : null;
}
