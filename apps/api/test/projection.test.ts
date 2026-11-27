import { addYearMonth, statementDates, statementMonthFor, todayIn } from "@miu/core";
import type { Account, Category, Dashboard, Pace, Projection } from "@miu/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setup, signUpVerified } from "./harness";

let t: Awaited<ReturnType<typeof setup>>;
let ana: string;
let nubank: Account;
let cats: Category[];
const today = todayIn("America/Sao_Paulo");
const CLOSING = 5;
const DUE = 12;

async function json<T>(res: Response | Promise<Response>, status = 200): Promise<T> {
  const r = await res;
  if (r.status !== status) throw new Error(`esperava ${status}, veio ${r.status}: ${await r.text()}`);
  return (await r.json()) as T;
}
const send = (method: string, path: string, body?: object, cookie = ana) =>
  t.req(path, { method, cookie, ...(body ? { json: body } : {}) });
const cat = (name: string) => cats.find((c) => c.name === name)?.id ?? "";
const card = (extra: object = {}) =>
  json<Account>(
    send("POST", "/api/accounts", {
      name: "Cartão Nubank",
      kind: "credit_card",
      creditLimitCents: 1_000_000,
      closingDay: CLOSING,
      dueDay: DUE,
      ...extra,
    }),
    201,
  );
const projection = (months = 4, cookie = ana) =>
  json<Projection>(t.req(`/api/insights/projection?months=${months}`, { cookie }));

beforeEach(async () => {
  t = await setup();
  ana = await signUpVerified(t);
  nubank = await json<Account>(
    send("POST", "/api/accounts", { name: "Nubank", kind: "checking", initialBalanceCents: 500_000 }),
    201,
  );
  cats = await json<Category[]>(t.req("/api/categories", { cookie: ana }));
});
afterEach(async () => t?.close());

describe("cartão ligado à conta", () => {
  it("valida a conta que paga a fatura", async () => {
    const c = await card({ payFromAccountId: nubank.id });
    expect(c.payFromAccountId).toBe(nubank.id);

    const outro = await card();
    await json(send("PATCH", `/api/accounts/${c.id}`, { payFromAccountId: outro.id }), 400); // cartão não paga cartão
    await json(send("PATCH", `/api/accounts/${nubank.id}`, { payFromAccountId: nubank.id }), 400); // só em cartão

    const bia = await signUpVerified(t, "bia@exemplo.com");
    const biaConta = await json<Account>(
      send("POST", "/api/accounts", { name: "Bia", kind: "checking" }, bia),
      201,
    );
    await json(send("PATCH", `/api/accounts/${c.id}`, { payFromAccountId: biaConta.id }), 404);

    const solto = await json<Account>(send("PATCH", `/api/accounts/${c.id}`, { payFromAccountId: null }));
    expect(solto.payFromAccountId).toBeNull();
  });

  it("excluir a conta ligada solta a ligação", async () => {
    const reserva = await json<Account>(
      send("POST", "/api/accounts", { name: "Reserva", kind: "savings" }),
      201,
    );
    const c = await card({ payFromAccountId: reserva.id });
    expect((await send("DELETE", `/api/accounts/${reserva.id}`)).status).toBe(204);
    const list = await json<Account[]>(t.req("/api/accounts", { cookie: ana }));
    expect(list.find((a) => a.id === c.id)?.payFromAccountId).toBeNull();
  });
});

describe("projeção das contas", () => {
  it("a fatura sai da conta ligada no mês do vencimento; parcelas nos meses seguintes", async () => {
    const c = await card({ payFromAccountId: nubank.id });
    await json(
      send("POST", "/api/transactions", {
        kind: "expense",
        amountCents: 30_000,
        accountId: c.id,
        categoryId: cat("Compras"),
        date: today,
        description: "Geladeira",
        installments: 3,
      }),
      201,
    );
    const p = await projection(5);
    const first = statementMonthFor(today, CLOSING);
    const dueMonths = [0, 1, 2].map((k) =>
      statementDates(addYearMonth(first, k), CLOSING, DUE).dueDate.slice(0, 7),
    );
    const final = p.months.at(-1);
    expect(final?.accounts[nubank.id]).toBe(500_000 - 30_000);
    // cada mês com vencimento tira R$ 100 da conta ligada
    for (const m of dueMonths) {
      const idx = p.months.findIndex((x) => x.month === m);
      if (idx <= 0) continue;
      const before = p.months[idx - 1]?.accounts[nubank.id] ?? 0;
      expect(before - (p.months[idx]?.accounts[nubank.id] ?? 0)).toBe(10_000);
    }
    expect(p.cardsWithoutPayer).toEqual([]);
  });

  it("cartão sem conta ligada entra só no total; assinatura no cartão projeta meses à frente", async () => {
    const c = await card();
    await json(
      send("POST", "/api/recurring", {
        kind: "expense",
        amountCents: 5_000,
        accountId: c.id,
        categoryId: cat("Assinaturas"),
        description: "Streaming",
        startDate: today,
      }),
      201,
    );
    const p = await projection(6);
    expect(p.cardsWithoutPayer).toEqual([c.id]);
    const last = p.months.at(-1);
    expect(last?.accounts[nubank.id]).toBe(500_000); // nada sai da conta: não está ligada
    expect(last?.unassignedCents ?? 0).toBeLessThanOrEqual(-5_000 * 4);
    expect(last?.totalCents).toBe(500_000 + (last?.unassignedCents ?? 0));
  });

  it("salário recorrente entra todo mês e o primeiro mês bate com a Visão geral", async () => {
    await json(
      send("POST", "/api/recurring", {
        kind: "income",
        amountCents: 700_000,
        accountId: nubank.id,
        categoryId: cat("Salário"),
        description: "Salário",
        startDate: today,
      }),
      201,
    );
    const p = await projection(4);
    const d = await json<Dashboard>(t.req("/api/dashboard", { cookie: ana }));
    expect(d.projectedEndCents).toBe(p.months[0]?.totalCents);
    expect((p.months[3]?.accounts[nubank.id] ?? 0) - (p.months[2]?.accounts[nubank.id] ?? 0)).toBe(700_000);
  });

  it("avisa o primeiro mês negativo e é isolada por usuário", async () => {
    await json(
      send("POST", "/api/recurring", {
        kind: "expense",
        amountCents: 300_000,
        accountId: nubank.id,
        categoryId: cat("Moradia"),
        description: "Aluguel",
        startDate: today,
      }),
      201,
    );
    const p = await projection(4);
    expect(p.firstNegative?.accountId).toBe(nubank.id);
    const bia = await signUpVerified(t, "bia@exemplo.com");
    const pb = await projection(4, bia);
    expect(pb.months[0]?.accounts).toEqual({});
    expect((await t.req("/api/insights/projection")).status).toBe(401);
  });
});

describe("ritmo com projeção do mês", () => {
  it("projeta o fechamento do mês somando fixos previstos", async () => {
    await json(
      send("POST", "/api/transactions", {
        kind: "expense",
        amountCents: 20_000,
        accountId: nubank.id,
        categoryId: cat("Mercado"),
        date: today,
        description: "Mercado",
      }),
      201,
    );
    const p = await json<Pace>(t.req("/api/insights/pace", { cookie: ana }));
    expect(p.projectedMonthCents).toBeGreaterThanOrEqual(p.spentCents + p.plannedCents);
  });
});
