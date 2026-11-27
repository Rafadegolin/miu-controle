import { addDays, addYearMonth, statementMonthFor, todayIn } from "@miu/core";
import { eq, schema } from "@miu/db";
import type { Account, Category, ImportPreview, ImportResult } from "@miu/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setup, signUpVerified } from "./harness";

let t: Awaited<ReturnType<typeof setup>>;
let ana: string;
let conta: Account;
let cartao: Account;
let cats: Category[];
const today = todayIn("America/Sao_Paulo");
const CLOSING = 5;

async function json<T>(res: Response | Promise<Response>, status: number): Promise<T> {
  const r = await res;
  if (r.status !== status) throw new Error(`esperava ${status}, veio ${r.status}: ${await r.text()}`);
  return (await r.json()) as T;
}
const post = <T>(path: string, body: object, status = 201, cookie = ana) =>
  json<T>(t.req(path, { method: "POST", cookie, json: body }), status);
const cat = (name: string) => cats.find((c) => c.name === name)?.id ?? null;
const preview = (accountId: string, rows: object[]) =>
  post<ImportPreview>("/api/import/preview", { accountId, rows }, 200);
const rowsOf = async () =>
  t.db.select().from(schema.transactions).where(eq(schema.transactions.accountId, cartao.id));

beforeEach(async () => {
  t = await setup();
  ana = await signUpVerified(t);
  conta = await post<Account>("/api/accounts", {
    name: "Nubank",
    kind: "checking",
    initialBalanceCents: 500_000,
  });
  cartao = await post<Account>("/api/accounts", {
    name: "Cartão Nubank",
    kind: "credit_card",
    creditLimitCents: 1_000_000,
    closingDay: CLOSING,
    dueDay: 12,
    payFromAccountId: conta.id,
  });
  cats = await json<Category[]>(t.req("/api/categories", { cookie: ana }), 200);
});
afterEach(async () => t?.close());

describe("fatura do cartão com parcelas", () => {
  it("reconhece a parcela, cria as próximas nas faturas seguintes e não duplica na próxima importação", async () => {
    const compraOriginal = addDays(today, -70); // banco mostra a data da compra original
    const p = await preview(cartao.id, [
      { date: compraOriginal, amountCents: 48_000, description: "NOTEBOOK DELL - PARC 03/10" },
      { date: today, amountCents: 4_590, description: "IFOOD *RESTAURANTE" },
    ]);
    const parcela = p.rows[0];
    expect(parcela).toMatchObject({
      description: "Notebook dell",
      installment: { no: 3, total: 10, explicit: true },
    });
    expect(p.statementMonth).toBe(statementMonthFor(today, CLOSING)); // pela compra à vista
    expect(p.rows[1]?.installment).toBeNull();

    const res = await post<ImportResult>("/api/import/confirm", {
      accountId: cartao.id,
      fileName: "fatura.csv",
      statementMonth: p.statementMonth,
      rows: p.rows.map((r) => ({
        date: r.date,
        kind: r.kind,
        amountCents: r.amountCents,
        description: r.description,
        categoryId: cat("Compras"),
        installment: r.installment ? { no: r.installment.no, total: r.installment.total } : null,
      })),
    });
    expect(res.inserted).toBe(8 + 1); // parcelas 3..10 + ifood

    const parcelas = (await rowsOf())
      .filter((r) => r.installmentGroupId)
      .sort((a, b) => (a.installmentNo ?? 0) - (b.installmentNo ?? 0));
    expect(parcelas.map((r) => r.installmentNo)).toEqual([3, 4, 5, 6, 7, 8, 9, 10]);
    expect(parcelas.map((r) => r.statementMonth?.slice(0, 7))).toEqual(
      [0, 1, 2, 3, 4, 5, 6, 7].map((k) => addYearMonth(p.statementMonth as string, k)),
    );

    // Fatura do mês seguinte traz a "PARC 04/10": já existe.
    const next = await preview(cartao.id, [
      { date: compraOriginal, amountCents: 48_000, description: "NOTEBOOK DELL - PARC 04/10" },
    ]);
    expect(next.rows[0]?.match?.level).toBe("exact");
  });

  it("desfazer a importação apaga também as parcelas futuras", async () => {
    const res = await post<ImportResult>("/api/import/confirm", {
      accountId: cartao.id,
      fileName: "fatura.csv",
      rows: [
        {
          date: today,
          kind: "expense",
          amountCents: 10_000,
          description: "Geladeira",
          categoryId: null,
          installment: { no: 1, total: 4 },
        },
      ],
    });
    expect((await rowsOf()).length).toBe(4);
    await json(t.req(`/api/import/batches/${res.batchId}`, { method: "DELETE", cookie: ana }), 200);
    expect((await rowsOf()).length).toBe(0);
  });
});

describe("extrato da conta com pagamento de fatura", () => {
  it("sugere o cartão ligado e grava como transferência para ele", async () => {
    await post("/api/transactions", {
      kind: "expense",
      amountCents: 30_000,
      accountId: cartao.id,
      categoryId: cat("Compras"),
      date: today,
      description: "Mercado",
    });
    const p = await preview(conta.id, [
      { date: today, amountCents: -30_000, description: "Pagamento de fatura" },
      { date: today, amountCents: -5_000, description: "PIX ENVIADO JOAO" },
    ]);
    expect(p.rows[0]).toMatchObject({ transferToCardId: cartao.id, categoryId: null });
    expect(p.rows[1]?.transferToCardId).toBeNull();

    await post("/api/import/confirm", {
      accountId: conta.id,
      fileName: "extrato.ofx",
      rows: [
        {
          date: today,
          kind: "expense",
          amountCents: 30_000,
          description: "Pagamento de fatura",
          categoryId: null,
          toAccountId: cartao.id,
        },
      ],
    });
    const [pg] = await t.db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.toAccountId, cartao.id));
    expect(pg).toMatchObject({
      kind: "transfer",
      accountId: conta.id,
      amountCents: 30_000,
      categoryId: null,
    });
    expect(pg?.statementMonth).toBeTruthy();
    const accs = await json<Account[]>(t.req("/api/accounts", { cookie: ana }), 200);
    expect(accs.find((a) => a.id === cartao.id)?.balanceCents).toBe(0); // fatura quitada
    expect(accs.find((a) => a.id === conta.id)?.balanceCents).toBe(470_000);
  });

  it("marca como repetido o que foi lançado à mão até 2 dias antes", async () => {
    await post("/api/transactions", {
      kind: "expense",
      amountCents: 12_345,
      accountId: conta.id,
      categoryId: cat("Mercado"),
      date: addDays(today, -2),
      description: "Mercado do bairro",
    });
    const p = await preview(conta.id, [
      { date: today, amountCents: -12_345, description: "COMPRA MERCADO X" },
    ]);
    expect(p.rows[0]?.match?.level).toBe("probable");
  });
});

describe("validação e isolamento", () => {
  it("recusa destino que não é cartão, de outra pessoa ou parcela fora de cartão", async () => {
    const reserva = await post<Account>("/api/accounts", { name: "Reserva", kind: "savings" });
    const row = { date: today, kind: "expense", amountCents: 1_000, description: "x", categoryId: null };
    await post(
      "/api/import/confirm",
      { accountId: conta.id, fileName: "a", rows: [{ ...row, toAccountId: reserva.id }] },
      400,
    );
    await post(
      "/api/import/confirm",
      { accountId: conta.id, fileName: "a", rows: [{ ...row, installment: { no: 1, total: 3 } }] },
      400,
    );
    await post(
      "/api/import/confirm",
      { accountId: cartao.id, fileName: "a", rows: [{ ...row, toAccountId: cartao.id }] },
      400,
    );

    const bia = await signUpVerified(t, "bia@exemplo.com");
    const biaConta = await post<Account>("/api/accounts", { name: "Bia", kind: "checking" }, 201, bia);
    await post(
      "/api/import/confirm",
      { accountId: biaConta.id, fileName: "a", rows: [{ ...row, toAccountId: cartao.id }] },
      404,
      bia,
    );
    expect((await rowsOf()).length).toBe(0);
  });
});
