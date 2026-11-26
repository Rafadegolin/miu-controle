import { monthToDate, statementMonthFor } from "@miu/core";
import { and, asc, eq, gte, isNull, or, schema, sql } from "@miu/db";
import { type Account, createAccountSchema, updateAccountSchema } from "@miu/shared";
import { Hono } from "hono";
import type { App } from "../env";
import { HttpError } from "../lib/errors";
import { accountBalances, ownedAccount, userToday } from "../lib/user-data";
import { valid } from "../lib/validate";
import { requireUser } from "../middleware/auth";

const { accounts, transactions } = schema;

type Row = typeof accounts.$inferSelect;
const toDto = (a: Row, balances: Map<string, number>): Account => ({
  id: a.id,
  name: a.name,
  kind: a.kind,
  color: a.color,
  initialBalanceCents: a.initialBalanceCents,
  balanceCents: a.initialBalanceCents + (balances.get(a.id) ?? 0),
  archived: a.archivedAt !== null,
  card:
    a.kind === "credit_card" && a.closingDay !== null && a.dueDay !== null
      ? { creditLimitCents: a.creditLimitCents ?? 0, closingDay: a.closingDay, dueDay: a.dueDay }
      : null,
});

async function withBalance(db: ReturnType<App["Variables"]["db"]>, userId: string, a: Row) {
  return toDto(a, await accountBalances(db, userId));
}

export const accountsRoutes = new Hono<App>()
  .use(requireUser)
  .get("/", async (c) => {
    const db = c.var.db();
    const userId = c.var.user.id;
    const [rows, balances] = await Promise.all([
      db
        .select()
        .from(accounts)
        .where(eq(accounts.userId, userId))
        .orderBy(asc(accounts.sortOrder), asc(accounts.createdAt)),
      accountBalances(db, userId),
    ]);
    return c.json(rows.map((a) => toDto(a, balances)));
  })
  .post("/", valid("json", createAccountSchema), async (c) => {
    const body = c.req.valid("json");
    const db = c.var.db();
    const userId = c.var.user.id;
    const [{ n } = { n: 0 }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(accounts)
      .where(eq(accounts.userId, userId));
    const [row] = await db
      .insert(accounts)
      .values({ id: crypto.randomUUID(), userId, sortOrder: n, ...body })
      .returning();
    if (!row) throw new Error("insert accounts");
    return c.json(toDto(row, new Map()), 201);
  })
  .patch("/:id", valid("json", updateAccountSchema), async (c) => {
    const db = c.var.db();
    const userId = c.var.user.id;
    const current = await ownedAccount(db, userId, c.req.param("id"));
    const patch = c.req.valid("json");
    const card = current.kind === "credit_card";
    if (
      !card &&
      (patch.creditLimitCents !== undefined || patch.closingDay !== undefined || patch.dueDay !== undefined)
    ) {
      throw new HttpError(
        400,
        "dados_invalidos",
        "Limite, fechamento e vencimento são só de cartão de crédito.",
      );
    }
    if (card && patch.initialBalanceCents !== undefined) {
      throw new HttpError(
        400,
        "dados_invalidos",
        "Cartão não tem saldo inicial: lance as compras e parcelas em aberto.",
      );
    }
    const [row] = await db
      .update(accounts)
      .set(patch)
      .where(and(eq(accounts.id, current.id), eq(accounts.userId, userId)))
      .returning();
    if (!row) throw new HttpError(404, "conta_nao_encontrada", "Conta não encontrada.");

    // Mudou o fechamento: recalcula em qual fatura caem as compras da fatura aberta em diante.
    // Faturas já fechadas e parcelas ficam como estão.
    if (card && patch.closingDay && patch.closingDay !== current.closingDay && current.closingDay) {
      const openMonth = statementMonthFor(await userToday(db, userId), current.closingDay);
      await db
        .update(transactions)
        .set({
          statementMonth: sql`(case when extract(day from ${transactions.date}) >= ${patch.closingDay}
            then date_trunc('month', ${transactions.date}) + interval '1 month'
            else date_trunc('month', ${transactions.date}) end)::date`,
        })
        .where(
          and(
            eq(transactions.userId, userId),
            eq(transactions.accountId, current.id),
            sql`${transactions.kind} <> 'transfer'`,
            isNull(transactions.installmentGroupId),
            gte(transactions.statementMonth, monthToDate(openMonth)),
          ),
        );
    }
    return c.json(await withBalance(db, userId, row));
  })
  .post("/:id/archive", async (c) => {
    const db = c.var.db();
    const userId = c.var.user.id;
    await ownedAccount(db, userId, c.req.param("id"));
    const [row] = await db
      .update(accounts)
      .set({ archivedAt: new Date() })
      .where(and(eq(accounts.id, c.req.param("id")), eq(accounts.userId, userId)))
      .returning();
    if (!row) throw new HttpError(404, "conta_nao_encontrada", "Conta não encontrada.");
    return c.json(await withBalance(db, userId, row));
  })
  .post("/:id/unarchive", async (c) => {
    const db = c.var.db();
    const userId = c.var.user.id;
    await ownedAccount(db, userId, c.req.param("id"));
    const [row] = await db
      .update(accounts)
      .set({ archivedAt: null })
      .where(and(eq(accounts.id, c.req.param("id")), eq(accounts.userId, userId)))
      .returning();
    if (!row) throw new HttpError(404, "conta_nao_encontrada", "Conta não encontrada.");
    return c.json(await withBalance(db, userId, row));
  })
  .delete("/:id", async (c) => {
    const db = c.var.db();
    const userId = c.var.user.id;
    const id = c.req.param("id");
    await ownedAccount(db, userId, id);
    const [used] = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          or(eq(transactions.accountId, id), eq(transactions.toAccountId, id)),
        ),
      )
      .limit(1);
    if (used) {
      throw new HttpError(
        409,
        "conta_com_lancamentos",
        "Esta conta tem lançamentos. Arquive a conta para escondê-la sem perder o histórico.",
      );
    }
    await db.delete(accounts).where(and(eq(accounts.id, id), eq(accounts.userId, userId)));
    return c.body(null, 204);
  });
