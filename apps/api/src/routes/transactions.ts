import { addYearMonth, dateToMonth, monthToDate, planInstallments, statementMonthFor } from "@miu/core";
import { and, type Db, desc, eq, gte, ilike, lt, or, schema, sql } from "@miu/db";
import {
  createTransactionSchema,
  deleteTransactionQuery,
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
import { cardLedger, focusMonth } from "../lib/cards";
import { HttpError } from "../lib/errors";
import { ownedAccount, ownedCategory, userToday } from "../lib/user-data";
import { valid } from "../lib/validate";
import { requireUser } from "../middleware/auth";

const { transactions } = schema;
type Row = typeof transactions.$inferSelect;
type AccountRow = Awaited<ReturnType<typeof ownedAccount>>;

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
  statementMonth: t.statementMonth ? dateToMonth(t.statementMonth) : null,
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

const isCard = (a: AccountRow) => a.kind === "credit_card" && a.closingDay !== null && a.dueDay !== null;

/**
 * Confere se contas e categoria pertencem ao usuário e combinam com o tipo do lançamento.
 * Devolve as contas para quem chamou decidir fatura/parcelas.
 */
async function checkRefs(
  db: Db,
  userId: string,
  t: { kind: Row["kind"]; accountId: string; toAccountId?: string | null; categoryId?: string | null },
) {
  const [account, toAccount] = await Promise.all([
    ownedAccount(db, userId, t.accountId, { activeOnly: true }),
    t.kind === "transfer" && t.toAccountId
      ? ownedAccount(db, userId, t.toAccountId, { activeOnly: true })
      : null,
    t.kind !== "transfer" && t.categoryId
      ? ownedCategory(db, userId, t.categoryId).then((cat) => {
          if (cat.kind !== t.kind) {
            throw new HttpError(
              400,
              "categoria_incompativel",
              "Essa categoria é de outro tipo de lançamento.",
            );
          }
        })
      : null,
  ]);
  if (t.kind === "transfer") {
    if (!toAccount) throw new HttpError(400, "dados_invalidos", "Escolha a conta de destino.");
    if (toAccount.id === account.id)
      throw new HttpError(400, "dados_invalidos", "Escolha contas diferentes.");
    if (isCard(account)) {
      throw new HttpError(
        400,
        "transferencia_do_cartao",
        "Transferência sai de uma conta. Para pagar a fatura, transfira de uma conta para o cartão.",
      );
    }
  }
  return { account, toAccount };
}

/** Fatura que um pagamento quita: a escolhida, ou a mais antiga em aberto. */
async function paymentStatement(db: Db, userId: string, card: AccountRow, today: string, chosen?: string) {
  if (chosen) return monthToDate(chosen);
  const ledger = await cardLedger(db, userId, card.id);
  const c = { id: card.id, closingDay: card.closingDay ?? 1, dueDay: card.dueDay ?? 1, creditLimitCents: 0 };
  return monthToDate(focusMonth(c, ledger, today));
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
    const [today, { account, toAccount }] = await Promise.all([
      userToday(db, userId),
      checkRefs(db, userId, body),
    ]);
    // Data no futuro é previsão: ainda não aconteceu.
    const status = body.date > today ? "planned" : body.status;
    const base = {
      userId,
      kind: body.kind,
      accountId: body.accountId,
      date: body.date,
      description: body.description,
      notes: body.notes ?? null,
      status,
    } as const;

    if (body.kind === "transfer") {
      const statementMonth =
        toAccount && isCard(toAccount)
          ? await paymentStatement(db, userId, toAccount, today, body.statementMonth)
          : null;
      const [row] = await db
        .insert(transactions)
        .values({
          ...base,
          id: crypto.randomUUID(),
          amountCents: body.amountCents,
          toAccountId: body.toAccountId,
          categoryId: null,
          statementMonth,
        })
        .returning();
      if (!row) throw new Error("insert transactions");
      return c.json(toTransactionDto(row), 201);
    }

    if (body.installments) {
      if (body.kind !== "expense" || !isCard(account)) {
        throw new HttpError(
          400,
          "parcelamento_invalido",
          "Só compras no cartão de crédito podem ser parceladas.",
        );
      }
      const groupId = crypto.randomUUID();
      const paid = body.installmentsPaid ?? 0;
      if (paid >= body.installments) {
        throw new HttpError(400, "parcelamento_invalido", "Ao menos uma parcela precisa estar em aberto.");
      }
      // Compra antiga: as parcelas já pagas não são criadas (nem pesam nas faturas passadas).
      const plan = planInstallments({
        totalCents: body.amountCents,
        count: body.installments,
        purchaseDate: body.date,
        closingDay: account.closingDay ?? 1,
      }).filter((p) => p.no > paid);
      // A compra já aconteceu: todas as parcelas ficam como realizadas (o limite já foi usado).
      const rows = await db
        .insert(transactions)
        .values(
          plan.map((p) => ({
            ...base,
            id: crypto.randomUUID(),
            amountCents: p.amountCents,
            categoryId: body.categoryId,
            date: p.date,
            status,
            statementMonth: monthToDate(p.statementMonth),
            installmentGroupId: groupId,
            installmentNo: p.no,
            installmentTotal: p.total,
          })),
        )
        .returning();
      const first = rows.find((r) => r.installmentNo === paid + 1);
      if (!first) throw new Error("insert parcelas");
      return c.json(toTransactionDto(first), 201);
    }

    const [row] = await db
      .insert(transactions)
      .values({
        ...base,
        id: crypto.randomUUID(),
        amountCents: body.amountCents,
        categoryId: body.categoryId,
        statementMonth: isCard(account)
          ? monthToDate(statementMonthFor(body.date, account.closingDay ?? 1))
          : null,
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
    if (
      current.installmentGroupId &&
      ((patch.accountId && patch.accountId !== current.accountId) ||
        (patch.date && patch.date !== current.date))
    ) {
      throw new HttpError(
        400,
        "parcela_fixa",
        "Conta e data de uma parcela não mudam. Exclua a compra e lance de novo, se precisar.",
      );
    }
    const next = { ...current, ...patch };
    const refsChanged =
      (patch.accountId !== undefined && patch.accountId !== current.accountId) ||
      (patch.toAccountId !== undefined && patch.toAccountId !== current.toAccountId) ||
      (patch.categoryId !== undefined && patch.categoryId !== current.categoryId);
    const [today, refs] = await Promise.all([
      userToday(db, userId),
      // Lançamento antigo numa conta arquivada continua editável enquanto a conta não muda.
      refsChanged || (patch.date && patch.date !== current.date) ? checkRefs(db, userId, next) : null,
    ]);

    let statementMonth = current.statementMonth;
    if (refs && !current.installmentGroupId) {
      if (current.kind === "transfer") {
        if (patch.toAccountId && patch.toAccountId !== current.toAccountId) {
          statementMonth =
            refs.toAccount && isCard(refs.toAccount)
              ? await paymentStatement(db, userId, refs.toAccount, today)
              : null;
        }
      } else {
        statementMonth = isCard(refs.account)
          ? monthToDate(statementMonthFor(next.date, refs.account.closingDay ?? 1))
          : null;
      }
    }

    const [row] = await db
      .update(transactions)
      .set({
        ...patch,
        statementMonth,
        // parcelas têm datas futuras mas já são compras feitas: não viram "previsto"
        status: !current.installmentGroupId && next.date > today ? "planned" : next.status,
      })
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
      // Pagou antes do dia previsto → fica com a data de hoje. Recorrência mantém a data da ocorrência
      // (é "o aluguel de dezembro"); mudar a data faria a regra gerar a mesma conta de novo.
      .set({
        status: "posted",
        // biome-ignore lint/complexity/useMathMinMax: comparação de strings ISO, não de números
        date: current.recurringRuleId ? current.date : current.date > today ? today : current.date,
      })
      .where(and(eq(transactions.id, current.id), eq(transactions.userId, userId)))
      .returning();
    if (!row) throw new HttpError(404, "lancamento_nao_encontrado", "Lançamento não encontrado.");
    return c.json(toTransactionDto(row));
  })
  .delete("/:id", valid("query", deleteTransactionQuery), async (c) => {
    const { scope } = c.req.valid("query");
    const db = c.var.db();
    const userId = c.var.user.id;
    const current = await ownedTransaction(db, userId, c.req.param("id"));
    if (scope === "following" && current.installmentGroupId && current.installmentNo) {
      await db
        .delete(transactions)
        .where(
          and(
            eq(transactions.userId, userId),
            eq(transactions.installmentGroupId, current.installmentGroupId),
            gte(transactions.installmentNo, current.installmentNo),
          ),
        );
    } else {
      await db
        .delete(transactions)
        .where(and(eq(transactions.id, current.id), eq(transactions.userId, userId)));
    }
    return c.body(null, 204);
  });
