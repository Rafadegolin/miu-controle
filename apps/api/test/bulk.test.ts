import { todayIn } from "@miu/core";
import type { Account, BulkResult, Category, Transaction, TransactionPage } from "@miu/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setup, signUpVerified } from "./harness";

let t: Awaited<ReturnType<typeof setup>>;
let ana: string;
let conta: Account;
let reserva: Account;
let cats: Category[];
const today = todayIn("America/Sao_Paulo");

async function json<T>(res: Response | Promise<Response>, status = 200): Promise<T> {
  const r = await res;
  if (r.status !== status) throw new Error(`esperava ${status}, veio ${r.status}: ${await r.text()}`);
  return (await r.json()) as T;
}
const post = <T>(path: string, body: object, cookie = ana, status = 201) =>
  json<T>(t.req(path, { method: "POST", cookie, json: body }), status);
const bulk = (body: object, cookie = ana, status = 200) =>
  post<BulkResult>("/api/transactions/bulk", body, cookie, status);
const cat = (name: string) => cats.find((c) => c.name === name)?.id ?? "";
const list = async (cookie = ana) =>
  (await json<TransactionPage>(t.req(`/api/transactions?month=${today.slice(0, 7)}`, { cookie }))).items;

beforeEach(async () => {
  t = await setup();
  ana = await signUpVerified(t);
  conta = await post<Account>("/api/accounts", { name: "Conta", kind: "checking" });
  reserva = await post<Account>("/api/accounts", { name: "Reserva", kind: "savings" });
  cats = await json<Category[]>(t.req("/api/categories", { cookie: ana }));
});
afterEach(async () => t?.close());

async function seed() {
  const base = { accountId: conta.id, date: today };
  const a = await post<Transaction>("/api/transactions", {
    ...base,
    kind: "expense",
    amountCents: 100,
    categoryId: cat("Mercado"),
  });
  const b = await post<Transaction>("/api/transactions", {
    ...base,
    kind: "expense",
    amountCents: 200,
    categoryId: cat("Compras"),
  });
  const c = await post<Transaction>("/api/transactions", {
    ...base,
    kind: "income",
    amountCents: 300,
    categoryId: cat("Salário"),
  });
  const d = await post<Transaction>("/api/transactions", {
    ...base,
    kind: "transfer",
    amountCents: 400,
    toAccountId: reserva.id,
  });
  return { a, b, c, d };
}

describe("ações em lote nos lançamentos", () => {
  it("troca a categoria só dos lançamentos do mesmo tipo", async () => {
    const { a, b, c, d } = await seed();
    const r = await bulk({ action: "set-category", ids: [a.id, b.id, c.id, d.id], categoryId: cat("Lazer") });
    expect(r).toEqual({ changed: 2, skipped: 2 });
    const items = await list();
    const byId = new Map(items.map((x) => [x.id, x]));
    expect(byId.get(a.id)?.categoryId).toBe(cat("Lazer"));
    expect(byId.get(b.id)?.categoryId).toBe(cat("Lazer"));
    expect(byId.get(c.id)?.categoryId).toBe(cat("Salário"));
    expect(byId.get(d.id)?.categoryId).toBeNull();
  });

  it("exclui vários de uma vez", async () => {
    const { a, b, d } = await seed();
    expect(await bulk({ action: "delete", ids: [a.id, b.id, d.id, a.id] })).toEqual({
      changed: 3,
      skipped: 0,
    });
    expect(await list()).toHaveLength(1);
  });

  it("valida a entrada", async () => {
    await bulk({ action: "delete", ids: [] }, ana, 400);
    await bulk({ action: "set-category", ids: ["x"] }, ana, 400);
    await bulk({ action: "delete", ids: Array.from({ length: 501 }, (_, i) => `id${i}`) }, ana, 400);
  });

  it("é isolado por usuário: ids de outra pessoa dão 404 e nada muda", async () => {
    const { a, b } = await seed();
    const bia = await signUpVerified(t, "bia@exemplo.com");
    const biaConta = await post<Account>("/api/accounts", { name: "Bia", kind: "checking" }, bia);
    const biaTx = await post<Transaction>(
      "/api/transactions",
      {
        accountId: biaConta.id,
        date: today,
        kind: "expense",
        amountCents: 999,
        categoryId: (await json<Category[]>(t.req("/api/categories", { cookie: bia })))[0]?.id,
      },
      bia,
    );

    await bulk({ action: "delete", ids: [a.id] }, bia, 404);
    await bulk({ action: "delete", ids: [a.id, biaTx.id] }, ana, 404);
    expect(await list()).toHaveLength(4);
    expect(await list(bia)).toHaveLength(1);

    // categoria de outra pessoa também não serve
    const biaCats = await json<Category[]>(t.req("/api/categories", { cookie: bia }));
    const biaLazer = biaCats.find((x) => x.name === "Lazer")?.id;
    await bulk({ action: "set-category", ids: [b.id], categoryId: biaLazer }, ana, 404);
    expect(
      (await t.req("/api/transactions/bulk", { method: "POST", json: { action: "delete", ids: [a.id] } }))
        .status,
    ).toBe(401);
  });
});

describe("CSRF", () => {
  it("POST de formulário vindo de outro site dá 403 (não 500)", async () => {
    const res = await t.app.request(
      "http://localhost/api/accounts",
      {
        method: "POST",
        headers: {
          origin: "https://site-malicioso.example",
          "content-type": "application/x-www-form-urlencoded",
        },
        body: "name=x",
      },
      t.env,
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ erro: "acesso_negado" });
  });
});
