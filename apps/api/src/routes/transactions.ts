import { addYearMonth } from "@miu/core";
import { and, type Db, desc, eq, gte, ilike, lt, or, schema, sql } from "@miu/db";
import {
  createTransactionSchema,
  listTransactionsQuery,
  type MonthSummary,
  type Transaction,
  type TransactionPage,
  updateTransactionSchema,
  yearMonth,
} from "@miu/shared";
import { Hono } from "hono";
import { z } from "zod";
import type { App } from "../env";
import { HttpError } from "../lib/errors";
import { ownedAccount, ownedCategory, userToday } from "../lib/user-data";
import { valid } from "../lib/validate";
import { requireUser } from "../middleware/auth";

const { transactions } = schema;
type Row = typeof transactions.$inferSelect;

export const toTransactionDto = (t: Row): Transaction => ({
  id: t.id,
  kind: t.kind,
  amountCents: t.amountCents,
  accountId: t.accountId,
  toAccountId: t.toAccountId,
  categoryId: t.categoryId,
  date: t.date,
  description: t.description,
  notes: t.notes,
  status: t.status,
  source: t.source,
  installment:
    t.installmentNo && t.installmentTotal ? { no: t.installmentNo, total: t.installmentTotal } : null,
});

const monthRange = (month: string) => ({ from: `${month}-01`, to: `${addYearMonth(month, 1)}-01` });

const encodeCursor = (t: Row) => btoa(`${t.date}|${t.id}`).replace(/=+$/, "");
function decodeCursor(cursor: string) {
  try {
    const [date, id] = atob(cursor).split("|");
    if (date && id && /^\d{4}-\d{2}-\d{2}$/.test(date)) return { date, id };
  } catch {}
  throw new HttpError(400, "cursor_invalido", "Página inválida. Recarregue a lista.");
}

/** Confere se contas e categoria pertencem ao usuário e combinam com o tipo do lançamento. */
async function checkRefs(
  db: Db,
  userId: string,
  t: { kind: Row["kind"]; accountId: string; toAccountId?: string | null; categoryId?: string | null },
) {
  const checks: Promise<unknown>[] = [ownedAccount(db, userId, t.accountId, { activeOnly: true })];
  if (t.kind === "transfer") {
    if (!t.toAccountId) throw new HttpError(400, "dados_invalidos", "Escolha a conta de destino.");
    if (t.toAccountId === t.accountId)
      throw new HttpError(400, "dados_invalidos", "Escolha contas diferentes.");
    checks.push(ownedAccount(db, userId, t.toAccountId, { activeOnly: true }));
  } else if (t.categoryId) {
    checks.push(
      ownedCategory(db, userId, t.categoryId).then((cat) => {
        if (cat.kind !== t.kind) {
          throw new HttpError(400, "categoria_incompativel", "Essa categoria é de outro tipo de lançamento.");
        }
      }),
    );
  }
  await Promise.all(checks);
}

async function ownedTransaction(db: Db, userId: string, id: string) {
  const [row] = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.userId, userId)));
  if (!row) throw new HttpError(404, "lancamento_nao_encontrado", "Lançamento não encontrado.");
  return row;
}

export const transactionsRoutes = new Hono<App>()
  .use(requireUser)
  .get("/", valid("query", listTransactionsQuery), async (c) => {
    const q = c.req.valid("query");
    const db = c.var.db();
    const { from, to } = monthRange(q.month);
    const cursor = q.cursor ? decodeCursor(q.cursor) : null;

    const rows = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, c.var.user.id),
          gte(transactions.date, from),
          lt(transactions.date, to),
          q.accountId
            ? or(eq(transactions.accountId, q.accountId), eq(transactions.toAccountId, q.accountId))
            : undefined,
          q.categoryId ? eq(transactions.categoryId, q.categoryId) : undefined,
          q.kind ? eq(transactions.kind, q.kind) : undefined,
          q.status ? eq(transactions.status, q.status) : undefined,
          q.q ? ilike(transactions.description, `%${q.q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`) : undefined,
          cursor
            ? or(
                lt(transactions.date, cursor.date),
                and(eq(transactions.date, cursor.date), lt(transactions.id, cursor.id)),
              )
            : undefined,
        ),
      )
      .orderBy(desc(transactions.date), desc(transactions.id))
      .limit(q.limit + 1);

    const page = rows.slice(0, q.limit);
    const last = page.at(-1);
    const body: TransactionPage = {
      items: page.map(toTransactionDto),
      nextCursor: rows.length > q.limit && last ? encodeCursor(last) : null,
    };
    return c.json(body);
  })
  .get("/summary", valid("query", z.object({ month: yearMonth })), async (c) => {
    const { month } = c.req.valid("query");
    const db = c.var.db();
    const { from, to } = monthRange(month);
    const inMonth = and(
      eq(transactions.userId, c.var.user.id),
      gte(transactions.date, from),
      lt(transactions.date, to),
    );
    const [totals, byCat] = await Promise.all([
      db
        .select({
          kind: transactions.kind,
          status: transactions.status,
          total: sql<string>`sum(${transactions.amountCents})`,
        })
        .from(transactions)
        .where(and(inMonth, sql`${transactions.kind} <> 'transfer'`))
        .groupBy(transactions.kind, transactions.status),
      db
        .select({
          categoryId: transactions.categoryId,
          posted: sql<string>`coalesce(sum(${transactions.amountCents}) filter (where ${transactions.status} = 'posted'), 0)`,
          planned: sql<string>`coalesce(sum(${transactions.amountCents}) filter (where ${transactions.status} = 'planned'), 0)`,
        })
        .from(transactions)
        .where(and(inMonth, eq(transactions.kind, "expense")))
        .groupBy(transactions.categoryId),
    ]);
    const get = (kind: string, status: string) =>
      Number(totals.find((r) => r.kind === kind && r.status === status)?.total ?? 0);
    const body: MonthSummary = {
      month,
      incomePostedCents: get("income", "posted"),
      incomePlannedCents: get("income", "planned"),
      expensePostedCents: get("expense", "posted"),
      expensePlannedCents: get("expense", "planned"),
      byCategory: byCat
        .map((r) => ({
          categoryId: r.categoryId,
          postedCents: Number(r.posted),
          plannedCents: Number(r.planned),
        }))
        .sort((a, b) => b.postedCents + b.plannedCents - (a.postedCents + a.plannedCents)),
    };
    return c.json(body);
  })
  .post("/", valid("json", createTransactionSchema), async (c) => {
    const body = c.req.valid("json");
    const db = c.var.db();
    const userId = c.var.user.id;
    const [today] = await Promise.all([userToday(db, userId), checkRefs(db, userId, body)]);
    const [row] = await db
      .insert(transactions)
      .values({
        id: crypto.randomUUID(),
        userId,
        kind: body.kind,
        amountCents: body.amountCents,
        accountId: body.accountId,
        toAccountId: body.kind === "transfer" ? body.toAccountId : null,
        categoryId: body.kind === "transfer" ? null : body.categoryId,
        date: body.date,
        description: body.description,
        notes: body.notes ?? null,
        // Data no futuro é sempre previsão: ainda não aconteceu.
        status: body.date > today ? "planned" : body.status,
      })
      .returning();
    if (!row) throw new Error("insert transactions");
    return c.json(toTransactionDto(row), 201);
  })
  .patch("/:id", valid("json", updateTransactionSchema), async (c) => {
    const patch = c.req.valid("json");
    const db = c.var.db();
    const userId = c.var.user.id;
    const current = await ownedTransaction(db, userId, c.req.param("id"));

    if (current.kind === "transfer" && patch.categoryId !== undefined) {
      throw new HttpError(400, "dados_invalidos", "Transferência não tem categoria.");
    }
    if (current.kind !== "transfer" && patch.toAccountId !== undefined) {
      throw new HttpError(400, "dados_invalidos", "Só transferências têm conta de destino.");
    }
    const next = { ...current, ...patch };
    if (patch.accountId || patch.toAccountId || patch.categoryId) await checkRefs(db, userId, next);
    const today = await userToday(db, userId);

    const [row] = await db
      .update(transactions)
      .set({ ...patch, status: next.date > today ? "planned" : next.status })
      .where(and(eq(transactions.id, current.id), eq(transactions.userId, userId)))
      .returning();
    if (!row) throw new HttpError(404, "lancamento_nao_encontrado", "Lançamento não encontrado.");
    return c.json(toTransactionDto(row));
  })
  /** Previsto → realizado (ex.: a conta de luz que estava prevista foi paga). */
  .post("/:id/confirm", async (c) => {
    const db = c.var.db();
    const userId = c.var.user.id;
    const current = await ownedTransaction(db, userId, c.req.param("id"));
    const today = await userToday(db, userId);
    const [row] = await db
      .update(transactions)
      // datas ISO (strings): pagou antes do dia previsto → fica com a data de hoje
      // biome-ignore lint/complexity/useMathMinMax: comparação de strings, não de números
      .set({ status: "posted", date: current.date > today ? today : current.date })
      .where(and(eq(transactions.id, current.id), eq(transactions.userId, userId)))
      .returning();
    if (!row) throw new HttpError(404, "lancamento_nao_encontrado", "Lançamento não encontrado.");
    return c.json(toTransactionDto(row));
  })
  .delete("/:id", async (c) => {
    const db = c.var.db();
    const userId = c.var.user.id;
    await ownedTransaction(db, userId, c.req.param("id"));
    await db
      .delete(transactions)
      .where(and(eq(transactions.id, c.req.param("id")), eq(transactions.userId, userId)));
    return c.body(null, 204);
  });
