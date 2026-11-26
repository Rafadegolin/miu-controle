import { addDays, todayIn } from "@miu/core";
import type { Account, Category, QuickSuggestions } from "@miu/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setup, signUpVerified } from "./harness";

let t: Awaited<ReturnType<typeof setup>>;
let ana: string;
let conta: Account;
let cartao: Account;
let cats: Category[];
const today = todayIn("America/Sao_Paulo");

async function json<T>(res: Response | Promise<Response>, status = 200): Promise<T> {
  const r = await res;
  if (r.status !== status) throw new Error(`esperava ${status}, veio ${r.status}: ${await r.text()}`);
  return (await r.json()) as T;
}
const post = <T>(path: string, body: object, cookie = ana) =>
  json<T>(t.req(path, { method: "POST", cookie, json: body }), 201);
const cat = (name: string) => cats.find((c) => c.name === name)?.id ?? "";
const spend = (description: string, amountCents: number, extra: object = {}) =>
  post("/api/transactions", {
    kind: "expense",
    amountCents,
    accountId: conta.id,
    categoryId: cat("Restaurantes"),
    date: today,
    description,
    ...extra,
  });

beforeEach(async () => {
  t = await setup();
  ana = await signUpVerified(t);
  conta = await post<Account>("/api/accounts", { name: "Conta", kind: "checking" });
  cartao = await post<Account>("/api/accounts", {
    name: "Cartão",
    kind: "credit_card",
    creditLimitCents: 500_000,
    closingDay: 5,
    dueDay: 12,
  });
  cats = await json<Category[]>(t.req("/api/categories", { cookie: ana }));
});
afterEach(async () => t?.close());

describe("sugestões do lançamento rápido", () => {
  it("aprende categoria, conta e valor repetido; lista os frequentes", async () => {
    await spend("iFood", 4500, { accountId: cartao.id });
    await spend("ifood", 4500, { accountId: cartao.id });
    await spend("iFood ", 6000, { accountId: cartao.id });
    await spend("Café", 900, { categoryId: cat("Mercado") });
    await spend("Café", 900, { categoryId: cat("Mercado") });
    await spend("Presente", 15000, { categoryId: cat("Compras") });

    const s = await json<QuickSuggestions>(t.req("/api/transactions/suggestions", { cookie: ana }));
    const ifood = s.history.find((h) => h.description.toLowerCase() === "ifood");
    expect(ifood).toMatchObject({
      count: 3,
      accountId: cartao.id,
      categoryId: cat("Restaurantes"),
      amountCents: 4500,
    });
    expect(s.history.find((h) => h.description === "Café")).toMatchObject({ amountCents: 900, count: 2 });
    expect(s.frequent.map((f) => f.description.toLowerCase())).toEqual(["ifood", "café"]);
    expect(s.last.expense).toMatchObject({ categoryId: cat("Compras") });
    expect(s.last.income).toBeNull();
  });

  it("ignora transferências, recorrências e lançamentos antigos", async () => {
    const reserva = await post<Account>("/api/accounts", { name: "Reserva", kind: "savings" });
    await post("/api/transactions", {
      kind: "transfer",
      amountCents: 1000,
      accountId: conta.id,
      toAccountId: reserva.id,
      date: today,
      description: "Guardar",
    });
    await post("/api/recurring", {
      kind: "expense",
      amountCents: 210_000,
      accountId: conta.id,
      categoryId: cat("Moradia"),
      description: "Aluguel",
      startDate: today,
    });
    await spend("Velho", 100, { date: addDays(today, -200) });
    const s = await json<QuickSuggestions>(t.req("/api/transactions/suggestions", { cookie: ana }));
    expect(s.history).toEqual([]);
  });

  it("é isolado por usuário", async () => {
    await spend("iFood", 4500);
    const bia = await signUpVerified(t, "bia@exemplo.com");
    const s = await json<QuickSuggestions>(t.req("/api/transactions/suggestions", { cookie: bia }));
    expect(s.history).toEqual([]);
    expect((await t.req("/api/transactions/suggestions")).status).toBe(401);
  });
});
