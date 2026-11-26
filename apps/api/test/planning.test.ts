import { addMonths, addYearMonth, todayIn } from "@miu/core";
import type { Account, BudgetMonth, Category, Goal, GoalContribution } from "@miu/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setup, signUpVerified } from "./harness";

let t: Awaited<ReturnType<typeof setup>>;
let ana: string;
let conta: Account;
let mercado: string;
let lazer: string;
let salario: string;
const today = todayIn("America/Sao_Paulo");
const month = today.slice(0, 7);

async function json<T>(res: Response | Promise<Response>, status = 200): Promise<T> {
  const r = await res;
  if (r.status !== status) throw new Error(`esperava ${status}, veio ${r.status}: ${await r.text()}`);
  return (await r.json()) as T;
}
const post = <T>(path: string, body: object = {}, status = 201) =>
  json<T>(t.req(path, { method: "POST", cookie: ana, json: body }), status);
const put = (path: string, body: object) => json(t.req(path, { method: "PUT", cookie: ana, json: body }));
const budgetMonth = (m = month) => json<BudgetMonth>(t.req(`/api/budgets?month=${m}`, { cookie: ana }));
const spend = (amountCents: number, categoryId: string, date = today, status = "posted") =>
  post("/api/transactions", { kind: "expense", amountCents, accountId: conta.id, categoryId, date, status });

beforeEach(async () => {
  t = await setup();
  ana = await signUpVerified(t);
  conta = await post<Account>("/api/accounts", {
    name: "Conta",
    kind: "checking",
    initialBalanceCents: 1_000_000,
  });
  const cats = await json<Category[]>(t.req("/api/categories", { cookie: ana }));
  mercado = cats.find((c) => c.name === "Mercado")?.id ?? "";
  lazer = cats.find((c) => c.name === "Lazer")?.id ?? "";
  salario = cats.find((c) => c.name === "Salário")?.id ?? "";
});
afterEach(async () => t?.close());

describe("orçamentos", () => {
  it("compara o gasto do mês com o limite e muda de situação em 80% e 100%", async () => {
    await put(`/api/budgets/${mercado}`, { month, amountCents: 100_000 });
    await spend(70_000, mercado);
    expect((await budgetMonth()).lines[0]).toMatchObject({
      limitCents: 100_000,
      spentCents: 70_000,
      status: "ok",
    });
    await spend(15_000, mercado);
    expect((await budgetMonth()).lines[0]?.status).toBe("warning");
    await spend(20_000, mercado);
    expect((await budgetMonth()).lines[0]).toMatchObject({ spentCents: 105_000, status: "over" });
  });

  it("separa previsto de realizado e calcula quanto dá por dia", async () => {
    await put(`/api/budgets/${lazer}`, { month, amountCents: 50_000 });
    await spend(10_000, lazer);
    await spend(5_000, lazer, today, "planned");
    const b = await budgetMonth();
    expect(b.lines[0]).toMatchObject({ spentCents: 10_000, plannedCents: 5_000 });
    expect(b.lines[0]?.dailyAllowanceCents).toBeGreaterThan(0);
    expect(b.totals).toMatchObject({ limitCents: 50_000, spentCents: 10_000, plannedCents: 5_000 });
  });

  it("um limite só: vale a partir do mês escolhido e mantém os meses anteriores", async () => {
    await put(`/api/budgets/${mercado}`, { month, amountCents: 100_000 });
    const next = addYearMonth(month, 1);
    await put(`/api/budgets/${mercado}`, { month: next, amountCents: 150_000 });
    expect((await budgetMonth(month)).lines[0]?.limitCents).toBe(100_000);
    expect((await budgetMonth(next)).lines[0]?.limitCents).toBe(150_000);
    expect((await budgetMonth(addYearMonth(month, 6))).lines[0]?.limitCents).toBe(150_000);
    expect((await budgetMonth(addYearMonth(month, -1))).lines).toEqual([]);

    // remover a partir de um mês
    await put(`/api/budgets/${mercado}`, { month: addYearMonth(month, 3), amountCents: null });
    expect((await budgetMonth(addYearMonth(month, 3))).lines).toEqual([]);
    expect((await budgetMonth(addYearMonth(month, 2))).lines[0]?.limitCents).toBe(150_000);
  });

  it("sugere limites pela média dos últimos 3 meses", async () => {
    for (let i = 1; i <= 3; i++) await spend(30_000, mercado, addMonths(today, -i));
    const b = await budgetMonth();
    expect(b.suggestions.find((s) => s.categoryId === mercado)).toMatchObject({
      averageCents: 30_000,
      suggestedCents: 30_000,
    });
  });

  it("não aceita orçamento em categoria de receita nem de outro usuário", async () => {
    const res = await t.req(`/api/budgets/${salario}`, {
      method: "PUT",
      cookie: ana,
      json: { month, amountCents: 1000 },
    });
    expect(res.status).toBe(400);
    const bia = await signUpVerified(t, "bia@exemplo.com");
    const outro = await t.req(`/api/budgets/${mercado}`, {
      method: "PUT",
      cookie: bia,
      json: { month, amountCents: 1000 },
    });
    expect(outro.status).toBe(404);
  });
});

describe("metas", () => {
  it("cria com valor inicial e calcula quanto guardar por mês", async () => {
    const g = await post<Goal>("/api/goals", {
      name: "Viagem",
      targetCents: 900_000,
      targetDate: addMonths(today, 10),
      initialCents: 100_000,
    });
    expect(g).toMatchObject({ savedCents: 100_000, monthlyNeededCents: 80_000 });
    expect(g.progress).toBeCloseTo(100_000 / 900_000);
  });

  it("aporta, retira e não deixa retirar mais do que tem", async () => {
    const g = await post<Goal>("/api/goals", { name: "Reserva", targetCents: 3_000_000 });
    expect(g.monthlyNeededCents).toBeNull();
    const a = await post<Goal>(`/api/goals/${g.id}/contributions`, { amountCents: 50_000, date: today });
    expect(a.savedCents).toBe(50_000);
    const r = await post<Goal>(`/api/goals/${g.id}/contributions`, { amountCents: -20_000, date: today });
    expect(r.savedCents).toBe(30_000);
    const demais = await t.req(`/api/goals/${g.id}/contributions`, {
      method: "POST",
      cookie: ana,
      json: { amountCents: -40_000, date: today },
    });
    expect(demais.status).toBe(400);

    const hist = await json<GoalContribution[]>(t.req(`/api/goals/${g.id}/contributions`, { cookie: ana }));
    expect(hist.map((h) => h.amountCents).sort()).toEqual([-20_000, 50_000].sort());
  });

  it("metas não mexem no saldo das contas", async () => {
    const g = await post<Goal>("/api/goals", { name: "Carro", targetCents: 4_000_000 });
    await post(`/api/goals/${g.id}/contributions`, { amountCents: 100_000, date: today });
    const accounts = await json<Account[]>(t.req("/api/accounts", { cookie: ana }));
    expect(accounts[0]?.balanceCents).toBe(1_000_000);
  });

  it("outro usuário não vê nem aporta em meta de ninguém", async () => {
    const g = await post<Goal>("/api/goals", { name: "Viagem", targetCents: 1000 });
    const bia = await signUpVerified(t, "bia@exemplo.com");
    expect(await json<Goal[]>(t.req("/api/goals", { cookie: bia }))).toEqual([]);
    for (const res of await Promise.all([
      t.req(`/api/goals/${g.id}`, { method: "PATCH", cookie: bia, json: { name: "x" } }),
      t.req(`/api/goals/${g.id}/contributions`, {
        method: "POST",
        cookie: bia,
        json: { amountCents: 1, date: today },
      }),
      t.req(`/api/goals/${g.id}/contributions`, { cookie: bia }),
      t.req(`/api/goals/${g.id}`, { method: "DELETE", cookie: bia }),
    ])) {
      expect(res.status).toBe(404);
    }
  });
});
