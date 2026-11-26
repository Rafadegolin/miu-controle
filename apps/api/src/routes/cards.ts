import { monthToDate } from "@miu/core";
import { and, desc, eq, schema } from "@miu/db";
import { type Statement, yearMonth } from "@miu/shared";
import { Hono } from "hono";
import { z } from "zod";
import type { App } from "../env";
import { type CardAccount, cardLedger, cardOverview, summarize } from "../lib/cards";
import { HttpError } from "../lib/errors";
import { accountBalances, ownedAccount, userToday } from "../lib/user-data";
import { valid } from "../lib/validate";
import { requireUser } from "../middleware/auth";
import { toTransactionDto } from "./transactions";

const { transactions } = schema;

export async function ownedCard(db: ReturnType<App["Variables"]["db"]>, userId: string, id: string) {
  const a = await ownedAccount(db, userId, id);
  if (a.kind !== "credit_card" || a.closingDay === null || a.dueDay === null) {
    throw new HttpError(404, "cartao_nao_encontrado", "Cartão não encontrado.");
  }
  return {
    ...a,
    closingDay: a.closingDay,
    dueDay: a.dueDay,
    creditLimitCents: a.creditLimitCents ?? 0,
  } satisfies CardAccount;
}

export const cardsRoutes = new Hono<App>()
  .use(requireUser)
  .get("/:id/overview", async (c) => {
    const db = c.var.db();
    const userId = c.var.user.id;
    const [card, balances, today] = await Promise.all([
      ownedCard(db, userId, c.req.param("id")),
      accountBalances(db, userId),
      userToday(db, userId),
    ]);
    const balance = card.initialBalanceCents + (balances.get(card.id) ?? 0);
    return c.json(await cardOverview(db, userId, card, balance, today));
  })
  .get(
    "/:id/statements/:month",
    valid("param", z.object({ id: z.string(), month: yearMonth })),
    async (c) => {
      const { id, month } = c.req.valid("param");
      const db = c.var.db();
      const userId = c.var.user.id;
      const [card, today] = await Promise.all([ownedCard(db, userId, id), userToday(db, userId)]);
      const [ledger, items] = await Promise.all([
        cardLedger(db, userId, card.id),
        db
          .select()
          .from(transactions)
          .where(
            and(
              eq(transactions.userId, userId),
              eq(transactions.statementMonth, monthToDate(month)),
              // compras e estornos do cartão + pagamentos feitos para esta fatura
              eq(transactions.accountId, card.id),
            ),
          )
          .orderBy(desc(transactions.date), desc(transactions.id)),
      ]);
      const body: Statement = {
        ...summarize(card, month, ledger, today),
        items: items.map(toTransactionDto),
      };
      return c.json(body);
    },
  );
