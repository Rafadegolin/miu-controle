import {
  addDays,
  detectInstallment,
  guessCategoryName,
  importedInstallments,
  looksLikeCardPayment,
  monthToDate,
  normalizeDescription,
  prettifyDescription,
  statementMonthFor,
} from "@miu/core";
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, schema, sql } from "@miu/db";
import {
  confirmImportSchema,
  type ImportBatch,
  type ImportPreview,
  type ImportResult,
  type PreviewRow,
  previewImportSchema,
} from "@miu/shared";
import { Hono } from "hono";
import { z } from "zod";
import type { App } from "../env";
import { cardLedger, focusMonth } from "../lib/cards";
import { HttpError } from "../lib/errors";
import { ownedAccount, userToday } from "../lib/user-data";
import { valid } from "../lib/validate";
import { requireUser } from "../middleware/auth";

const { transactions, categories, importBatches, accounts } = schema;

/** Identidade de uma parcela: mesma compra (descrição base), mesmo número, total e valor. */
const installmentKey = (base: string, no: number, total: number, amount: number) =>
  `${normalizeDescription(base)}|${no}|${total}|${amount}`;

/** Chaves para "já lancei algo parecido": as 3 e as 2 primeiras palavras da descrição normalizada. */
const historyKeys = (description: string) => {
  const words = normalizeDescription(description).split(" ").filter(Boolean);
  return [words.slice(0, 3).join(" "), words.slice(0, 2).join(" ")].filter(Boolean);
};

export const importRoutes = new Hono<App>()
  .use(requireUser)
  /**
   * Recebe as linhas já lidas no navegador e devolve a prévia: tipo, categoria sugerida
   * e o que provavelmente já existe (para não duplicar). Não grava nada.
   */
  .post("/preview", valid("json", previewImportSchema), async (c) => {
    const body = c.req.valid("json");
    const db = c.var.db();
    const userId = c.var.user.id;
    const account = await ownedAccount(db, userId, body.accountId, { activeOnly: true });
    const isCard = account.kind === "credit_card";
    const positiveIsExpense = body.positiveIsExpense ?? isCard;

    const dates = body.rows.map((r) => r.date).sort();
    const [existing, history, cats, cards, existingInstallments] = await Promise.all([
      db
        .select({
          id: transactions.id,
          date: transactions.date,
          kind: transactions.kind,
          amount: transactions.amountCents,
          description: transactions.description,
          fitid: transactions.importFitid,
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, userId),
            eq(transactions.accountId, account.id),
            gte(transactions.date, addDays(dates[0] ?? "1970-01-01", -2)),
            lte(transactions.date, addDays(dates.at(-1) ?? "1970-01-01", 2)),
          ),
        ),
      db
        .select({
          description: transactions.description,
          categoryId: transactions.categoryId,
          kind: transactions.kind,
        })
        .from(transactions)
        .where(and(eq(transactions.userId, userId), isNotNull(transactions.categoryId)))
        .orderBy(desc(transactions.date))
        .limit(3000),
      db
        .select({ id: categories.id, name: categories.name, kind: categories.kind })
        .from(categories)
        .where(and(eq(categories.userId, userId), isNull(categories.archivedAt))),
      db
        .select({ id: accounts.id, payFromAccountId: accounts.payFromAccountId })
        .from(accounts)
        .where(
          and(eq(accounts.userId, userId), eq(accounts.kind, "credit_card"), isNull(accounts.archivedAt)),
        ),
      isCard
        ? db
            .select({
              id: transactions.id,
              date: transactions.date,
              description: transactions.description,
              no: transactions.installmentNo,
              total: transactions.installmentTotal,
              amount: transactions.amountCents,
            })
            .from(transactions)
            .where(
              and(
                eq(transactions.userId, userId),
                eq(transactions.accountId, account.id),
                isNotNull(transactions.installmentGroupId),
              ),
            )
        : Promise.resolve([]),
    ]);

    const learned = new Map<string, string>();
    for (const h of history) {
      for (const k of historyKeys(h.description)) {
        const key = `${h.kind}:${k}`;
        if (h.categoryId && !learned.has(key)) learned.set(key, h.categoryId);
      }
    }
    const activeCats = new Set(cats.map((x) => x.id));
    const byName = new Map(cats.map((x) => [`${x.kind}:${x.name.toLowerCase()}`, x.id]));
    const byFitid = new Map(existing.filter((e) => e.fitid).map((e) => [e.fitid as string, e]));
    const byInstallment = new Map(
      existingInstallments
        .filter((e) => e.no && e.total)
        .map((e) => [installmentKey(e.description, e.no as number, e.total as number, e.amount), e]),
    );
    // Pagamento de fatura no extrato da conta: o cartão ligado a esta conta (ou o único cartão).
    const payCard = isCard
      ? undefined
      : (cards.find((c) => c.payFromAccountId === account.id) ?? (cards.length === 1 ? cards[0] : undefined));
    const dayDiff = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;

    const rows: PreviewRow[] = body.rows.map((r, index) => {
      const outflow = positiveIsExpense ? r.amountCents > 0 : r.amountCents < 0;
      const kind = outflow ? "expense" : "income";
      const amountCents = Math.abs(r.amountCents);
      const det = isCard && kind === "expense" ? detectInstallment(r.description) : null;
      const rawDescription = det ? det.base : r.description;
      const norm = normalizeDescription(rawDescription);

      const fitMatch = r.fitid ? byFitid.get(r.fitid) : undefined;
      // Parcela que uma importação anterior (ou o lançamento à mão) já criou: não duplica.
      const instMatch = det
        ? byInstallment.get(installmentKey(rawDescription, det.no, det.total, amountCents))
        : undefined;
      const near = existing.filter(
        (e) =>
          dayDiff(e.date, r.date) <= 2 &&
          e.amount === amountCents &&
          (e.kind === kind || (kind === "expense" && e.kind === "transfer")),
      );
      const exact =
        fitMatch ??
        (instMatch ? { ...instMatch, kind } : undefined) ??
        near.find((e) => e.date === r.date && normalizeDescription(e.description) === norm);
      const probable = exact ? undefined : near[0];
      const m = exact ?? probable;
      const transferToCardId =
        payCard && kind === "expense" && looksLikeCardPayment(r.description) ? payCard.id : null;

      let categoryId: string | null = null;
      let categorySource: PreviewRow["categorySource"] = null;
      const fromHistory = (transferToCardId ? [] : historyKeys(rawDescription))
        .map((k) => learned.get(`${kind}:${k}`))
        .find(Boolean);
      if (fromHistory && activeCats.has(fromHistory)) {
        categoryId = fromHistory;
        categorySource = "history";
      } else {
        const name = transferToCardId ? null : guessCategoryName(rawDescription, kind);
        const idByName = name ? byName.get(`${kind}:${name.toLowerCase()}`) : undefined;
        if (idByName) {
          categoryId = idByName;
          categorySource = "keyword";
        }
      }

      return {
        index,
        date: r.date,
        kind,
        amountCents,
        description: prettifyDescription(rawDescription) || "Lançamento importado",
        fitid: r.fitid ?? null,
        categoryId,
        categorySource,
        match: m
          ? {
              level: exact ? "exact" : "probable",
              transactionId: m.id,
              description: m.description,
              date: m.date,
            }
          : null,
        installment: det ? { no: det.no, total: det.total, explicit: det.explicit } : null,
        transferToCardId,
      };
    });

    // Cartão: a fatura que o arquivo parece ser = a mais comum entre as compras à vista
    // (parcelas costumam vir com a data da compra original). Sem compras à vista: a fatura aberta.
    let statementMonth: string | null = null;
    if (isCard && account.closingDay) {
      const counts = new Map<string, number>();
      for (const r of rows) {
        if (r.installment) continue;
        const sm = statementMonthFor(r.date, account.closingDay);
        counts.set(sm, (counts.get(sm) ?? 0) + 1);
      }
      statementMonth =
        [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ??
        statementMonthFor(await userToday(db, userId), account.closingDay);
    }

    const preview: ImportPreview = { accountId: account.id, rows, statementMonth };
    return c.json(preview);
  })
  /** Grava as linhas escolhidas como um lote (que pode ser desfeito inteiro). */
  .post("/confirm", valid("json", confirmImportSchema), async (c) => {
    const body = c.req.valid("json");
    const db = c.var.db();
    const userId = c.var.user.id;
    const [account, today] = await Promise.all([
      ownedAccount(db, userId, body.accountId, { activeOnly: true }),
      userToday(db, userId),
    ]);

    const catIds = [...new Set(body.rows.map((r) => r.categoryId).filter((x): x is string => Boolean(x)))];
    if (catIds.length) {
      const owned = await db
        .select({ id: categories.id, kind: categories.kind })
        .from(categories)
        .where(and(eq(categories.userId, userId), inArray(categories.id, catIds)));
      const kinds = new Map(owned.map((o) => [o.id, o.kind]));
      for (const r of body.rows) {
        if (!r.categoryId || r.toAccountId) continue;
        const k = kinds.get(r.categoryId);
        if (!k) throw new HttpError(404, "categoria_nao_encontrada", "Categoria não encontrada.");
        if (k !== r.kind) {
          throw new HttpError(
            400,
            "categoria_incompativel",
            `"${r.description}": a categoria é de outro tipo.`,
          );
        }
      }
    }

    const isCardAccount = account.kind === "credit_card";
    const targetIds = [
      ...new Set(body.rows.map((r) => r.toAccountId).filter((x): x is string => Boolean(x))),
    ];
    const targets = new Map<string, typeof account>();
    if (targetIds.length) {
      if (isCardAccount) {
        throw new HttpError(
          400,
          "dados_invalidos",
          "Pagamento de fatura vem do extrato da conta, não do cartão.",
        );
      }
      for (const id of targetIds) {
        const t = await ownedAccount(db, userId, id, { activeOnly: true });
        if (t.kind !== "credit_card" || !t.closingDay || !t.dueDay) {
          throw new HttpError(400, "dados_invalidos", "O pagamento de fatura precisa ir para um cartão.");
        }
        targets.set(id, t);
      }
    }
    if (!isCardAccount && body.rows.some((r) => r.installment)) {
      throw new HttpError(400, "dados_invalidos", "Parcelas são só de cartão de crédito.");
    }
    const ledgers = new Map(
      await Promise.all(targetIds.map(async (id) => [id, await cardLedger(db, userId, id)] as const)),
    );

    const batchId = crypto.randomUUID();
    await db.insert(importBatches).values({
      id: batchId,
      userId,
      accountId: account.id,
      fileName: body.fileName,
      rowCount: body.rows.length,
    });

    const closing = isCardAccount ? account.closingDay : null;
    type Row = typeof transactions.$inferInsert;
    const values: Row[] = body.rows.flatMap((r): Row[] => {
      const base = {
        userId,
        accountId: account.id,
        amountCents: r.amountCents,
        description: r.description,
        source: "import" as const,
        importBatchId: batchId,
      };
      // Pagamento de fatura: transferência da conta para o cartão (quita a fatura em aberto da data).
      const target = r.toAccountId ? targets.get(r.toAccountId) : undefined;
      if (target) {
        const card = {
          id: target.id,
          closingDay: target.closingDay as number,
          dueDay: target.dueDay as number,
          creditLimitCents: target.creditLimitCents ?? 0,
        };
        return [
          {
            ...base,
            id: crypto.randomUUID(),
            kind: "transfer",
            toAccountId: target.id,
            categoryId: null,
            date: r.date,
            status: r.date > today ? "planned" : "posted",
            importFitid: r.fitid ?? null,
            statementMonth: monthToDate(focusMonth(card, ledgers.get(target.id) ?? new Map(), r.date)),
          },
        ];
      }
      // Parcela no cartão: esta e as próximas, nas faturas seguintes (como uma compra parcelada).
      if (r.installment && closing) {
        const groupId = crypto.randomUUID();
        const sm = body.statementMonth ?? statementMonthFor(r.date, closing);
        return importedInstallments({
          rowDate: r.date,
          no: r.installment.no,
          total: r.installment.total,
          statementMonth: sm,
          closingDay: closing,
        }).map((p) => ({
          ...base,
          id: crypto.randomUUID(),
          kind: r.kind,
          categoryId: r.categoryId,
          date: p.date,
          status: "posted",
          importFitid: p.no === r.installment?.no ? (r.fitid ?? null) : null,
          statementMonth: monthToDate(p.statementMonth),
          installmentGroupId: groupId,
          installmentNo: p.no,
          installmentTotal: r.installment?.total ?? null,
        }));
      }
      return [
        {
          ...base,
          id: crypto.randomUUID(),
          kind: r.kind,
          categoryId: r.categoryId,
          date: r.date,
          status: r.date > today ? "planned" : "posted",
          importFitid: r.fitid ?? null,
          statementMonth: closing ? monthToDate(statementMonthFor(r.date, closing)) : null,
        },
      ];
    });
    let inserted = 0;
    for (let i = 0; i < values.length; i += 500) {
      const res = await db
        .insert(transactions)
        .values(values.slice(i, i + 500))
        .onConflictDoNothing()
        .returning({ id: transactions.id });
      inserted += res.length;
    }
    await db.update(importBatches).set({ rowCount: inserted }).where(eq(importBatches.id, batchId));

    const result: ImportResult = { batchId, inserted, skipped: body.rows.length - inserted };
    return c.json(result, 201);
  })
  .get("/batches", async (c) => {
    const db = c.var.db();
    const userId = c.var.user.id;
    const rows = await db
      .select({
        id: importBatches.id,
        accountId: importBatches.accountId,
        fileName: importBatches.fileName,
        rowCount: importBatches.rowCount,
        createdAt: importBatches.createdAt,
        remaining: sql<number>`(select count(*)::int from transactions t where t.import_batch_id = import_batches.id)`,
      })
      .from(importBatches)
      .where(eq(importBatches.userId, userId))
      .orderBy(desc(importBatches.createdAt))
      .limit(30);
    return c.json(
      rows.map(
        (r): ImportBatch => ({
          ...r,
          remaining: Number(r.remaining),
          createdAt: r.createdAt.toISOString(),
        }),
      ),
    );
  })
  /** Desfaz uma importação: apaga os lançamentos que vieram dela. */
  .delete("/batches/:id", async (c) => {
    const db = c.var.db();
    const userId = c.var.user.id;
    const [batch] = await db
      .select()
      .from(importBatches)
      .where(and(eq(importBatches.id, c.req.param("id")), eq(importBatches.userId, userId)));
    if (!batch) throw new HttpError(404, "importacao_nao_encontrada", "Importação não encontrada.");
    const removed = await db
      .delete(transactions)
      .where(and(eq(transactions.userId, userId), eq(transactions.importBatchId, batch.id)))
      .returning({ id: transactions.id });
    await db.delete(importBatches).where(eq(importBatches.id, batch.id));
    return c.json({ removed: removed.length });
  });

/* ---------- exportação ---------- */

const csvCell = (v: string) => (/[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
/**
 * Texto livre (descrição, nomes): se começar com = + - @, o Excel/Planilhas lê como fórmula
 * (ex.: =HYPERLINK(...)). Um apóstrofo na frente faz virar texto.
 */
const csvText = (v: string) => csvCell(/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);
const csvMoney = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
const KIND_PT = { income: "Receita", expense: "Despesa", transfer: "Transferência" } as const;

export const exportRoutes = new Hono<App>().use(requireUser).get(
  "/transactions.csv",
  valid(
    "query",
    z.object({
      from: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      to: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    }),
  ),
  async (c) => {
    const { from, to } = c.req.valid("query");
    const db = c.var.db();
    const userId = c.var.user.id;
    const [rows, accs, cats] = await Promise.all([
      db
        .select()
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, userId),
            from ? gte(transactions.date, from) : undefined,
            to ? lte(transactions.date, to) : undefined,
          ),
        )
        .orderBy(asc(transactions.date), asc(transactions.createdAt)),
      db.select({ id: accounts.id, name: accounts.name }).from(accounts).where(eq(accounts.userId, userId)),
      db
        .select({ id: categories.id, name: categories.name })
        .from(categories)
        .where(eq(categories.userId, userId)),
    ]);
    const accName = new Map(accs.map((a) => [a.id, a.name]));
    const catName = new Map(cats.map((x) => [x.id, x.name]));
    const header = "data;tipo;valor;descricao;categoria;conta;conta_destino;situacao;parcela;fatura";
    const lines = rows.map((t) =>
      [
        t.date,
        KIND_PT[t.kind],
        csvMoney(t.kind === "expense" ? -t.amountCents : t.amountCents),
        csvText(t.description),
        csvText(t.categoryId ? (catName.get(t.categoryId) ?? "") : ""),
        csvText(accName.get(t.accountId) ?? ""),
        csvText(t.toAccountId ? (accName.get(t.toAccountId) ?? "") : ""),
        t.status === "posted" ? "Realizado" : "Previsto",
        t.installmentNo && t.installmentTotal ? `${t.installmentNo}/${t.installmentTotal}` : "",
        t.statementMonth ? t.statementMonth.slice(0, 7) : "",
      ].join(";"),
    );
    // BOM para o Excel abrir com acentos certos.
    const csv = `﻿${[header, ...lines].join("\r\n")}\r\n`;
    return c.body(csv, 200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="miu-lancamentos${from ? `-${from}` : ""}${to ? `-a-${to}` : ""}.csv"`,
      "Cache-Control": "private, no-store",
    });
  },
);
