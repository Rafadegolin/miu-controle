import {
  addYearMonth,
  cumulativeByDay,
  dailyAllowance,
  daysInMonth,
  monthToDate,
  paceStatus,
  valueAtDay,
} from "@miu/core";
import { and, eq, gte, lt, schema, sql } from "@miu/db";
import { type Pace, yearMonth } from "@miu/shared";
import { Hono } from "hono";
import { z } from "zod";
import type { App } from "../env";
import { getSettings, userToday } from "../lib/user-data";
import { valid } from "../lib/validate";
import { requireUser } from "../middleware/auth";

const { transactions } = schema;

export const insightsRoutes = new Hono<App>()
  .use(requireUser)
  /**
   * Ritmo de gastos do mês: gasto acumulado (realizado) dia a dia vs. o mês passado até o mesmo dia.
   * Despesas de todas as contas e cartões, pela data da compra; transferências não contam.
   */
  .get("/pace", valid("query", z.object({ month: yearMonth.optional() })), async (c) => {
    const db = c.var.db();
    const userId = c.var.user.id;
    const [today, settings] = await Promise.all([userToday(db, userId), getSettings(db, userId)]);
    const month = c.req.valid("query").month ?? today.slice(0, 7);
    const prev = addYearMonth(month, -1);
    const from = monthToDate(addYearMonth(month, -3));
    const to = monthToDate(addYearMonth(month, 1));

    const rows = await db
      .select({
        date: transactions.date,
        status: transactions.status,
        total: sql<string>`sum(${transactions.amountCents})`,
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
      .groupBy(transactions.date, transactions.status);

    const posted = rows
      .filter((r) => r.status === "posted")
      .map((r) => ({ date: r.date, amountCents: Number(r.total) }));
    const y = Number(month.slice(0, 4));
    const m = Number(month.slice(5, 7));
    const total = daysInMonth(y, m);
    const isCurrentMonth = month === today.slice(0, 7);
    const day = isCurrentMonth ? Number(today.slice(8, 10)) : month < today.slice(0, 7) ? total : 0;

    const current = cumulativeByDay(posted, month, day);
    const previous = cumulativeByDay(posted, prev);
    const spentCents = valueAtDay(current, day);
    const previousToDateCents = valueAtDay(previous, day);
    const plannedCents = rows
      .filter((r) => r.status === "planned" && r.date.slice(0, 7) === month)
      .reduce((s, r) => s + Number(r.total), 0);
    const last3 = [1, 2, 3].map((i) => {
      const mm = addYearMonth(month, -i);
      return posted.filter((p) => p.date.slice(0, 7) === mm).reduce((s, p) => s + p.amountCents, 0);
    });

    const limitCents = settings.monthlySpendingLimitCents;
    const remainingCents = limitCents === null ? null : limitCents - spentCents;
    const body: Pace = {
      month,
      isCurrentMonth,
      daysInMonth: total,
      day,
      daysLeft: isCurrentMonth ? total - day + 1 : 0,
      current,
      previous,
      spentCents,
      plannedCents,
      previousToDateCents,
      previousTotalCents: valueAtDay(previous, previous.length),
      differenceCents: spentCents - previousToDateCents,
      status: paceStatus(spentCents, previousToDateCents),
      limitCents,
      remainingCents,
      dailyAllowanceCents:
        remainingCents === null ? null : dailyAllowance(remainingCents - plannedCents, month, today),
      averageCents: Math.round(last3.reduce((a, b) => a + b, 0) / 3),
    };
    return c.json(body);
  });
