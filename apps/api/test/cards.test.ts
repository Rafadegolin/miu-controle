import { addYearMonth, statementMonthFor, todayIn } from "@miu/core";
import type { Account, CardOverview, Category, Statement, Transaction, TransactionPage } from "@miu/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setup, signUpVerified } from "./harness";

let t: Awaited<ReturnType<typeof setup>>;
let ana: string;
let conta: Account;
let cartao: Account;
let compras: string;
let estornoCat: string;

const today = todayIn("America/Sao_Paulo");
const CLOSING = 3;
const DUE = 10;
const open = statementMonthFor(today, CLOSING);

async function json<T>(res: Response | Promise<Response>, status = 200): Promise<T> {
  const r = await res;
  if (r.status !== status) throw new Error(`esperava ${status}, veio ${r.status}: ${await r.text()}`);
  return (await r.json()) as T;
}
const post = <T>(path: string, body: object, status = 201) =>
  json<T>(t.req(path, { method: "POST", cookie: ana, json: body }), status);
const overview = (id = cartao.id) => json<CardOverview>(t.req(`/api/cards/${id}/overview`, { cookie: ana }));
const statement = (month: string, id = cartao.id) =>
  json<Statement>(t.req(`/api/cards/${id}/statements/${month}`, { cookie: ana }));

beforeEach(async () => {
  t = await setup();
  ana = await signUpVerified(t);
  conta = await post<Account>("/api/accounts", {
    name: "Conta",
    kind: "checking",
    initialBalanceCents: 1_000_000,
  });
  cartao = await post<Account>("/api/accounts", {
    name: "Cartão Grafite",
    kind: "credit_card",
    creditLimitCents: 500_000,
    closingDay: CLOSING,
    dueDay: DUE,
  });
  const cats = await json<Category[]>(t.req("/api/categories", { cookie: ana }));
  compras = cats.find((c) => c.name === "Compras")?.id ?? "";
  estornoCat = cats.find((c) => c.name === "Outras receitas")?.id ?? "";
});
afterEach(async () => t?.close());

describe("cartão", () => {
  it("cria cartão com limite, fechamento e vencimento", () => {
    expect(cartao).toMatchObject({
      kind: "credit_card",
      balanceCents: 0,
      card: { creditLimitCents: 500_000, closingDay: CLOSING, dueDay: DUE },
    });
  });

  it("recusa dia de fechamento inválido", async () => {
    const res = await t.req("/api/accounts", {
      method: "POST",
      cookie: ana,
      json: { name: "X", kind: "credit_card", creditLimitCents: 1, closingDay: 31, dueDay: 10 },
    });
    expect(res.status).toBe(400);
  });

  it("compra cai na fatura certa, pelo dia de fechamento", async () => {
    const [y, m] = [today.slice(0, 4), today.slice(5, 7)];
    const antes = await post<Transaction>("/api/transactions", {
      kind: "expense",
      amountCents: 1000,
      accountId: cartao.id,
      categoryId: compras,
      date: `${y}-${m}-02`,
    });
    const noDia = await post<Transaction>("/api/transactions", {
      kind: "expense",
      amountCents: 2000,
      accountId: cartao.id,
      categoryId: compras,
      date: `${y}-${m}-03`,
    });
    expect(antes.statementMonth).toBe(`${y}-${m}`);
    expect(noDia.statementMonth).toBe(addYearMonth(`${y}-${m}`, 1));
  });

  it("compra parcelada em 10x aparece certa em 10 faturas e usa o limite inteiro", async () => {
    const first = await post<Transaction>("/api/transactions", {
      kind: "expense",
      amountCents: 480_000,
      accountId: cartao.id,
      categoryId: compras,
      date: today,
      description: "Notebook",
      installments: 10,
    });
    expect(first).toMatchObject({
      installment: { no: 1, total: 10 },
      statementMonth: open,
      amountCents: 48_000,
    });

    for (let i = 0; i < 10; i++) {
      const s = await statement(addYearMonth(open, i));
      expect(s.items).toHaveLength(1);
      expect(s.items[0]).toMatchObject({ description: "Notebook", installment: { no: i + 1, total: 10 } });
      expect(s.totalCents).toBe(48_000);
    }
    expect((await statement(addYearMonth(open, 10))).items).toHaveLength(0);

    const o = await overview();
    expect(o).toMatchObject({ usedCents: 480_000, availableCents: 20_000, openMonth: open });
    expect(o.upcoming.map((u) => u.totalCents)).toEqual(Array(6).fill(48_000));
    expect(o.installments).toEqual([
      expect.objectContaining({ description: "Notebook", nextNo: 1, total: 10, remainingCents: 480_000 }),
    ]);
  });

  it("parcelas não mexem no saldo da conta nem no resultado de outros meses além do delas", async () => {
    await post("/api/transactions", {
      kind: "expense",
      amountCents: 30_000,
      accountId: cartao.id,
      categoryId: compras,
      date: today,
      installments: 3,
    });
    const accounts = await json<Account[]>(t.req("/api/accounts", { cookie: ana }));
    expect(accounts.find((a) => a.id === conta.id)?.balanceCents).toBe(1_000_000);
    expect(accounts.find((a) => a.id === cartao.id)?.balanceCents).toBe(-30_000);
  });

  it("pagar a fatura vira transferência: a conta cai, a fatura zera e não conta como despesa", async () => {
    await post("/api/transactions", {
      kind: "expense",
      amountCents: 12_345,
      accountId: cartao.id,
      categoryId: compras,
      date: today,
    });
    const before = await statement(open);
    expect(before).toMatchObject({ totalCents: 12_345, remainingCents: 12_345, status: "open" });

    const pay = await post<Transaction>("/api/transactions", {
      kind: "transfer",
      amountCents: 12_345,
      accountId: conta.id,
      toAccountId: cartao.id,
      date: today,
      statementMonth: open,
    });
    expect(pay.statementMonth).toBe(open);

    const after = await statement(open);
    expect(after).toMatchObject({ paidCents: 12_345, remainingCents: 0 });
    const accounts = await json<Account[]>(t.req("/api/accounts", { cookie: ana }));
    expect(accounts.find((a) => a.id === conta.id)?.balanceCents).toBe(1_000_000 - 12_345);
    expect(accounts.find((a) => a.id === cartao.id)?.balanceCents).toBe(0);

    const summary = await json<{ expensePostedCents: number }>(
      t.req(`/api/transactions/summary?month=${today.slice(0, 7)}`, { cookie: ana }),
    );
    expect(summary.expensePostedCents).toBe(12_345); // a compra, não o pagamento
  });

  it("pagamento sem fatura escolhida quita a mais antiga em aberto", async () => {
    const pay = await post<Transaction>("/api/transactions", {
      kind: "transfer",
      amountCents: 100,
      accountId: conta.id,
      toAccountId: cartao.id,
      date: today,
    });
    expect(pay.statementMonth).toBe(open);
  });

  it("estorno (receita no cartão) abate da fatura", async () => {
    await post("/api/transactions", {
      kind: "expense",
      amountCents: 5000,
      accountId: cartao.id,
      categoryId: compras,
      date: today,
    });
    await post("/api/transactions", {
      kind: "income",
      amountCents: 1500,
      accountId: cartao.id,
      categoryId: estornoCat,
      date: today,
    });
    expect((await statement(open)).totalCents).toBe(3500);
  });

  it("não deixa transferir do cartão nem parcelar fora do cartão", async () => {
    const doCartao = await t.req("/api/transactions", {
      method: "POST",
      cookie: ana,
      json: { kind: "transfer", amountCents: 100, accountId: cartao.id, toAccountId: conta.id, date: today },
    });
    expect(doCartao.status).toBe(400);
    expect(await doCartao.json()).toMatchObject({ erro: "transferencia_do_cartao" });

    const parceladoNaConta = await t.req("/api/transactions", {
      method: "POST",
      cookie: ana,
      json: {
        kind: "expense",
        amountCents: 100,
        accountId: conta.id,
        categoryId: compras,
        date: today,
        installments: 3,
      },
    });
    expect(parceladoNaConta.status).toBe(400);
  });

  it("excluir 'esta e as próximas' remove só a partir da parcela escolhida", async () => {
    await post("/api/transactions", {
      kind: "expense",
      amountCents: 60_000,
      accountId: cartao.id,
      categoryId: compras,
      date: today,
      installments: 6,
    });
    const terceira = (await statement(addYearMonth(open, 2))).items[0];
    expect(terceira?.installment?.no).toBe(3);
    const del = await t.req(`/api/transactions/${terceira?.id}?scope=following`, {
      method: "DELETE",
      cookie: ana,
    });
    expect(del.status).toBe(204);
    const o = await overview();
    expect(o.usedCents).toBe(20_000);
    expect(o.installments[0]).toMatchObject({ total: 6, remainingCents: 20_000 });
  });

  it("editar valor de uma parcela muda só ela; data e conta da parcela não mudam", async () => {
    const first = await post<Transaction>("/api/transactions", {
      kind: "expense",
      amountCents: 30_000,
      accountId: cartao.id,
      categoryId: compras,
      date: today,
      installments: 3,
    });
    const ok = await json<Transaction>(
      t.req(`/api/transactions/${first.id}`, { method: "PATCH", cookie: ana, json: { amountCents: 9_000 } }),
    );
    expect(ok.amountCents).toBe(9_000);
    expect((await statement(addYearMonth(open, 1))).totalCents).toBe(10_000);

    const bad = await t.req(`/api/transactions/${first.id}`, {
      method: "PATCH",
      cookie: ana,
      json: { date: "2020-01-01" },
    });
    expect(bad.status).toBe(400);
  });

  it("mudar o fechamento recalcula a fatura das compras em aberto", async () => {
    const [y, m] = [today.slice(0, 4), today.slice(5, 7)];
    const tx = await post<Transaction>("/api/transactions", {
      kind: "expense",
      amountCents: 1000,
      accountId: cartao.id,
      categoryId: compras,
      date: today,
    });
    expect(tx.statementMonth).toBe(open);
    await json(
      t.req(`/api/accounts/${cartao.id}`, { method: "PATCH", cookie: ana, json: { closingDay: 28 } }),
    );
    const page = await json<TransactionPage>(t.req(`/api/transactions?month=${y}-${m}`, { cookie: ana }));
    expect(page.items.find((i) => i.id === tx.id)?.statementMonth).toBe(statementMonthFor(today, 28));
  });

  it("outro usuário não vê nem paga o cartão de ninguém", async () => {
    const bia = await signUpVerified(t, "bia@exemplo.com");
    expect((await t.req(`/api/cards/${cartao.id}/overview`, { cookie: bia })).status).toBe(404);
    expect((await t.req(`/api/cards/${cartao.id}/statements/${open}`, { cookie: bia })).status).toBe(404);
    // conta comum não é cartão
    expect((await t.req(`/api/cards/${conta.id}/overview`, { cookie: ana })).status).toBe(404);
  });
});
