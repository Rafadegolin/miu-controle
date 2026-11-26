import { addYearMonth, statementMonthFor, todayIn } from "@miu/core";
import type {
  Account,
  CardOverview,
  Category,
  ImportBatch,
  ImportPreview,
  ImportResult,
  Transaction,
  TransactionPage,
} from "@miu/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setup, signUpVerified } from "./harness";

let t: Awaited<ReturnType<typeof setup>>;
let ana: string;
let conta: Account;
let cats: Category[];
const today = todayIn("America/Sao_Paulo");
const month = today.slice(0, 7);
const d = (day: number) => `${month}-${String(day).padStart(2, "0")}`;

async function json<T>(res: Response | Promise<Response>, status = 200): Promise<T> {
  const r = await res;
  if (r.status !== status) throw new Error(`esperava ${status}, veio ${r.status}: ${await r.text()}`);
  return (await r.json()) as T;
}
const post = <T>(path: string, body: object = {}, status = 201) =>
  json<T>(t.req(path, { method: "POST", cookie: ana, json: body }), status);
const cat = (name: string) => cats.find((c) => c.name === name)?.id ?? "";

const rows = [
  { date: d(1), amountCents: -18735, description: "SUPERMERCADO CENTRAL", fitid: "A1" },
  { date: d(1), amountCents: -5890, description: "IFOOD *RESTAURANTE", fitid: "A2" },
  { date: d(2), amountCents: 780000, description: "SALARIO EMPRESA", fitid: "A3" },
  { date: d(2), amountCents: -9999, description: "XYZ DESCONHECIDO", fitid: "A4" },
];

beforeEach(async () => {
  t = await setup();
  ana = await signUpVerified(t);
  conta = await post<Account>("/api/accounts", { name: "Conta", kind: "checking", initialBalanceCents: 0 });
  cats = await json<Category[]>(t.req("/api/categories", { cookie: ana }));
});
afterEach(async () => t?.close());

const preview = (
  r: { date: string; amountCents: number; description: string; fitid?: string }[] = rows,
  extra: object = {},
) => post<ImportPreview>("/api/import/preview", { accountId: conta.id, rows: r, ...extra }, 200);
const confirm = (p: ImportPreview, fileName = "extrato.ofx") =>
  post<ImportResult>("/api/import/confirm", {
    accountId: p.accountId,
    fileName,
    rows: p.rows
      .filter((r) => !r.match)
      .map((r) => ({
        date: r.date,
        kind: r.kind,
        amountCents: r.amountCents,
        description: r.description,
        categoryId: r.categoryId,
        fitid: r.fitid,
      })),
  });

describe("importar extrato", () => {
  it("prévia: tipo pelo sinal, descrição legível e categoria sugerida por palavra-chave", async () => {
    const p = await preview();
    expect(p.rows.map((r) => [r.kind, r.amountCents])).toEqual([
      ["expense", 18735],
      ["expense", 5890],
      ["income", 780000],
      ["expense", 9999],
    ]);
    expect(p.rows[0]).toMatchObject({
      description: "Supermercado central",
      categoryId: cat("Mercado"),
      categorySource: "keyword",
    });
    expect(p.rows[1]?.categoryId).toBe(cat("Restaurantes"));
    expect(p.rows[2]?.categoryId).toBe(cat("Salário"));
    expect(p.rows[3]).toMatchObject({ categoryId: null, categorySource: null, match: null });
  });

  it("aprende com o histórico: o que você já categorizou ganha da palavra-chave", async () => {
    await post("/api/transactions", {
      kind: "expense",
      amountCents: 100,
      accountId: conta.id,
      categoryId: cat("Lazer"),
      date: d(1),
      description: "Xyz desconhecido clube",
    });
    const p = await preview();
    expect(p.rows[3]).toMatchObject({ categoryId: cat("Lazer"), categorySource: "history" });
  });

  it("grava como lote, mexe no saldo e importar o mesmo arquivo de novo não duplica", async () => {
    const r1 = await confirm(await preview());
    expect(r1).toMatchObject({ inserted: 4, skipped: 0 });
    const accounts = await json<Account[]>(t.req("/api/accounts", { cookie: ana }));
    expect(accounts[0]?.balanceCents).toBe(780000 - 18735 - 5890 - 9999);

    const again = await preview();
    expect(again.rows.every((r) => r.match?.level === "exact")).toBe(true);
    // mesmo forçando (ignorando a prévia), o FITID impede duplicar
    const forced = await post<ImportResult>("/api/import/confirm", {
      accountId: conta.id,
      fileName: "de-novo.ofx",
      rows: again.rows.map((r) => ({
        date: r.date,
        kind: r.kind,
        amountCents: r.amountCents,
        description: r.description,
        categoryId: r.categoryId,
        fitid: r.fitid,
      })),
    });
    expect(forced).toMatchObject({ inserted: 0, skipped: 4 });
  });

  it("sem FITID: reconhece o que já foi lançado à mão como provável duplicado", async () => {
    await post("/api/transactions", {
      kind: "expense",
      amountCents: 18735,
      accountId: conta.id,
      categoryId: cat("Mercado"),
      date: d(1),
      description: "Mercado do mês",
    });
    const p = await preview(rows.map(({ fitid: _f, ...r }) => r));
    expect(p.rows[0]?.match).toMatchObject({ level: "probable", description: "Mercado do mês" });
    expect(p.rows[1]?.match).toBeNull();
  });

  it("desfazer uma importação apaga só o que veio dela", async () => {
    await post("/api/transactions", {
      kind: "expense",
      amountCents: 1,
      accountId: conta.id,
      categoryId: cat("Outros gastos"),
      date: d(1),
      description: "manual",
    });
    const r = await confirm(await preview());
    const batches = await json<ImportBatch[]>(t.req("/api/import/batches", { cookie: ana }));
    expect(batches[0]).toMatchObject({ id: r.batchId, fileName: "extrato.ofx", rowCount: 4, remaining: 4 });
    const undo = await json<{ removed: number }>(
      t.req(`/api/import/batches/${r.batchId}`, { method: "DELETE", cookie: ana }),
    );
    expect(undo.removed).toBe(4);
    const page = await json<TransactionPage>(t.req(`/api/transactions?month=${month}`, { cookie: ana }));
    expect(page.items.map((i) => i.description)).toEqual(["manual"]);
  });

  it("fatura de cartão: positivo é compra e cada uma cai na fatura certa", async () => {
    const cartao = await post<Account>("/api/accounts", {
      name: "Cartão",
      kind: "credit_card",
      creditLimitCents: 100_000,
      closingDay: 3,
      dueDay: 10,
    });
    const p = await post<ImportPreview>(
      "/api/import/preview",
      {
        accountId: cartao.id,
        rows: [
          { date: d(2), amountCents: 4590, description: "Loja" },
          { date: d(5), amountCents: 1840, description: "Uber *Trip" },
          { date: d(6), amountCents: -1000, description: "Estorno loja" },
        ],
      },
      200,
    );
    expect(p.rows.map((r) => r.kind)).toEqual(["expense", "expense", "income"]);
    await post("/api/import/confirm", {
      accountId: cartao.id,
      fileName: "fatura.csv",
      rows: p.rows.map((r) => ({
        date: r.date,
        kind: r.kind,
        amountCents: r.amountCents,
        description: r.description,
        categoryId: r.kind === "expense" ? cat("Compras") : cat("Outras receitas"),
      })),
    });
    const page = await json<TransactionPage>(
      t.req(`/api/transactions?month=${month}&accountId=${cartao.id}`, { cookie: ana }),
    );
    const byDesc = new Map(page.items.map((i) => [i.description, i.statementMonth]));
    expect(byDesc.get("Loja")).toBe(month);
    expect(byDesc.get("Uber *Trip")).toBe(addYearMonth(month, 1));
  });

  it("valida conta, categoria e tamanho; outro usuário não usa nem desfaz", async () => {
    const bia = await signUpVerified(t, "bia@exemplo.com");
    const res = await t.req("/api/import/preview", {
      method: "POST",
      cookie: bia,
      json: { accountId: conta.id, rows },
    });
    expect(res.status).toBe(404);
    const r = await confirm(await preview());
    expect((await t.req(`/api/import/batches/${r.batchId}`, { method: "DELETE", cookie: bia })).status).toBe(
      404,
    );
    const grande = await t.req("/api/import/preview", {
      method: "POST",
      cookie: ana,
      json: { accountId: conta.id, rows: Array(2001).fill(rows[0]) },
    });
    expect(grande.status).toBe(400);
  });
});

describe("exportar", () => {
  it("gera CSV com BOM, separador ; e vírgula decimal", async () => {
    await post("/api/transactions", {
      kind: "expense",
      amountCents: 12345,
      accountId: conta.id,
      categoryId: cat("Mercado"),
      date: d(1),
      description: 'Feira "da esquina"; centro',
    });
    const res = await t.req("/api/export/transactions.csv", { cookie: ana });
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toContain("attachment");
    const bytes = new Uint8Array(await res.clone().arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = await res.text();
    const [, line] = text.trim().split("\r\n");
    expect(line).toBe(`${d(1)};Despesa;-123,45;"Feira ""da esquina""; centro";Mercado;Conta;;Realizado;;`);
  });
});

describe("dívida que já existe no cartão", () => {
  it("compra antiga parcelada: cria só as parcelas que faltam", async () => {
    const cartao = await post<Account>("/api/accounts", {
      name: "Cartão",
      kind: "credit_card",
      creditLimitCents: 1_000_000,
      closingDay: 3,
      dueDay: 10,
    });
    // compra de 10x feita há 4 faturas, 4 parcelas já pagas
    const purchase = `${addYearMonth(month, -4)}-15`;
    const first = await post<Transaction>("/api/transactions", {
      kind: "expense",
      amountCents: 480_000,
      accountId: cartao.id,
      categoryId: cat("Compras"),
      date: purchase,
      description: "Notebook",
      installments: 10,
      installmentsPaid: 4,
    });
    expect(first.installment).toEqual({ no: 5, total: 10 });
    expect(first.statementMonth).toBe(addYearMonth(statementMonthFor(purchase, 3), 4));
    const o = await json<CardOverview>(t.req(`/api/cards/${cartao.id}/overview`, { cookie: ana }));
    expect(o.usedCents).toBe(6 * 48_000);
  });
});
