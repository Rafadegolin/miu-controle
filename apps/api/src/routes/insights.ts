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
import { type Future, type Pace, yearMonth } from "@miu/shared";
import { Hono } from "hono";
import { z } from "zod";
import type { App } from "../env";
import { buildProjection } from "../lib/projection";
import { accountBalances, getSettings, userToday } from "../lib/user-data";
import { valid } from "../lib/validate";
import { latestCdiAnnual } from "../lib/yields";
import { requireUser } from "../middleware/auth";
import { loadGoals } from "./goals";

const { transactions, categories, accounts } = schema;

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
  )
  /**
   * Entrada do Futuro: projeção do que é certo + gasto variável médio (3 meses fechados, sem
   * recorrências e parcelas) + metas e caixinhas. O cálculo e a simulação rodam no aparelho.
   */
  .get(
    "/future",
    valid("query", z.object({ months: z.coerce.number().int().min(3).max(24).default(12) })),
    async (c) => {
      const { months } = c.req.valid("query");
      const db = c.var.db();
      const userId = c.var.user.id;
      const today = await userToday(db, userId);
      const month = today.slice(0, 7);
      const hist = [1, 2, 3].map((i) => addYearMonth(month, -i));
      const ym = sql<string>`to_char(${transactions.date}, 'YYYY-MM')`;
      const [projection, rows, cats, goalList, boxRows, balances, cdiAnnual] = await Promise.all([
        buildProjection(db, userId, months),
        db
          .select({
            categoryId: transactions.categoryId,
            month: ym,
            total: sql<string>`sum(${transactions.amountCents})`,
          })
          .from(transactions)
          .where(
            and(
              eq(transactions.userId, userId),
              eq(transactions.kind, "expense"),
              eq(transactions.status, "posted"),
              // variável = sem recorrência e sem parcela (o mesmo critério do ritmo)
              sql`${transactions.recurringRuleId} is null and ${transactions.installmentGroupId} is null`,
              gte(transactions.date, monthToDate(hist[2] as string)),
              lt(transactions.date, monthToDate(addYearMonth(month, 1))),
            ),
          )
          .groupBy(transactions.categoryId, ym),
        db.select().from(categories).where(eq(categories.userId, userId)),
        loadGoals(db, userId, today),
        db
          .select()
          .from(accounts)
          .where(
            and(
              eq(accounts.userId, userId),
              sql`${accounts.cdiPercent} is not null`,
              sql`${accounts.archivedAt} is null`,
            ),
          ),
        accountBalances(db, userId),
        latestCdiAnnual(db),
      ]);

      // Gasto variável por categoria: média dos 3 meses fechados e o último mês.
      const byCat = new Map<string, { sum3: number; last: number }>();
      let sum3 = 0;
      let current = 0;
      for (const r of rows) {
        const v = Number(r.total);
        if (r.month === month) {
          current += v;
          continue;
        }
        sum3 += v;
        if (!r.categoryId) continue;
        const e = byCat.get(r.categoryId) ?? { sum3: 0, last: 0 };
        e.sum3 += v;
        if (r.month === hist[0]) e.last += v;
        byCat.set(r.categoryId, e);
      }
      const catById = new Map(cats.map((x) => [x.id, x]));

      // Mês atual: o que ainda falta pelo ritmo (a mesma regra da projeção do mês em /pace).
      const dim = daysInMonth(Number(month.slice(0, 4)), Number(month.slice(5, 7)));
      const day = Number(today.slice(8, 10));
      const histDays = hist.reduce(
        (s, mm) => s + daysInMonth(Number(mm.slice(0, 4)), Number(mm.slice(5, 7))),
        0,
      );
      const left =
        projectMonthSpend({
          spentCents: current,
          variableSpentCents: current,
          plannedRemainingCents: 0,
          day,
          daysInMonth: dim,
          historyDailyCents: sum3 > 0 ? sum3 / histDays : 0,
        }) - current;

      const body: Future = {
        today,
        months: projection.months.map((m) => ({
          month: m.month,
          knownTotalCents: m.totalCents,
          billsCents: projection.billsByMonth[m.month] ?? 0,
        })),
        firstNegative: projection.firstNegative,
        variableMonthlyCents: Math.round(sum3 / 3),
        currentMonthVariableLeftCents: Math.max(0, left),
        categories: [...byCat.entries()]
          .map(([id, e]) => {
            const cat = catById.get(id);
            return {
              id,
              name: cat?.name ?? "Sem categoria",
              color: cat?.color ?? "#8a9a94",
              icon: cat?.icon ?? "tag",
              averageCents: Math.round(e.sum3 / 3),
              lastMonthCents: e.last,
            };
          })
          .filter((x) => x.averageCents > 0)
          .sort((a, b) => b.averageCents - a.averageCents),
        goals: goalList
          .filter((g) => !g.archived)
          .map((g) => ({
            id: g.id,
            name: g.name,
            color: g.color,
            targetCents: g.targetCents,
            savedCents: g.savedCents,
            recentMonthlyCents: g.recentMonthlyCents,
            accountId: g.box?.accountId ?? null,
            cdiPercent: g.box?.cdiPercent ?? null,
          })),
        boxes: boxRows.map((a) => ({
          accountId: a.id,
          balanceCents: a.initialBalanceCents + (balances.get(a.id) ?? 0),
          cdiPercent: a.cdiPercent as number,
        })),
        cdiAnnualPercent: cdiAnnual,
      };
      return c.json(body);
    },
  );
