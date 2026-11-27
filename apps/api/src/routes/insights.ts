import {
  addYearMonth,
  cumulativeByDay,
  dailyAllowance,
  daysInMonth,
  monthToDate,
  paceStatus,
  projectMonthSpend,
  valueAtDay,
} from "@miu/core";
import { and, eq, gte, lt, schema, sql } from "@miu/db";
import { type Pace, yearMonth } from "@miu/shared";
import { Hono } from "hono";
import { z } from "zod";
import type { App } from "../env";
import { buildProjection } from "../lib/projection";
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
        // Fixo = recorrência ou parcela: já entra como previsto, não segue o "ritmo".
        fixed: sql<boolean>`(${transactions.recurringRuleId} is not null or ${transactions.installmentGroupId} is not null)`,
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
      .groupBy(
        transactions.date,
        transactions.status,
        sql`(${transactions.recurringRuleId} is not null or ${transactions.installmentGroupId} is not null)`,
      );

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
    // Gasto variável (sem fixos) para o ritmo da projeção.
    const variable = rows
      .filter((r) => r.status === "posted" && !r.fixed)
      .map((r) => ({ date: r.date, amountCents: Number(r.total) }));
    const variableSpentCents = valueAtDay(cumulativeByDay(variable, month, day), day);
    const histMonths = [1, 2, 3].map((i) => addYearMonth(month, -i));
    const histDays = histMonths.reduce(
      (s2, mm) => s2 + daysInMonth(Number(mm.slice(0, 4)), Number(mm.slice(5, 7))),
      0,
    );
    const histVariable = variable
      .filter((v) => histMonths.includes(v.date.slice(0, 7)))
      .reduce((s2, v) => s2 + v.amountCents, 0);
    const projectedMonthCents = isCurrentMonth
      ? projectMonthSpend({
          spentCents,
          variableSpentCents,
          plannedRemainingCents: plannedCents,
          day,
          daysInMonth: total,
          historyDailyCents: histVariable > 0 ? histVariable / histDays : 0,
        })
      : spentCents + plannedCents;
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
      projectedMonthCents,
    };
    return c.json(body);
  })
  /** Saldo previsto das contas mês a mês (o mês atual primeiro). */
  .get(
    "/projection",
    valid("query", z.object({ months: z.coerce.number().int().min(1).max(24).default(6) })),
    async (c) => {
      const { months } = c.req.valid("query");
      return c.json(await buildProjection(c.var.db(), c.var.user.id, months));
    },
  );
