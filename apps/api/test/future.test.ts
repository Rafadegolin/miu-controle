import { addDays, addYearMonth, projectFuture, todayIn } from "@miu/core";
import type { Account, Category, Future, Projection } from "@miu/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setup, signUpVerified } from "./harness";

let t: Awaited<ReturnType<typeof setup>>;
let ana: string;
let nubank: Account;
let cats: Category[];
const today = todayIn("America/Sao_Paulo");
const month = today.slice(0, 7);

async function json<T>(res: Response | Promise<Response>, status = 200): Promise<T> {
  const r = await res;
  if (r.status !== status) throw new Error(`esperava ${status}, veio ${r.status}: ${await r.text()}`);
  return (await r.json()) as T;
}
const send = (method: string, path: string, body?: object, cookie = ana) =>
  t.req(path, { method, cookie, ...(body ? { json: body } : {}) });
const cat = (name: string) => cats.find((c) => c.name === name)?.id ?? "";
const future = (cookie = ana) => json<Future>(t.req("/api/insights/future?months=12", { cookie }));
const expense = (amountCents: number, date: string, category: string, extra: object = {}) =>
  json(
    send("POST", "/api/transactions", {
      kind: "expense",
      amountCents,
      accountId: nubank.id,
      categoryId: cat(category),
      date,
      description: "Gasto",
      ...extra,
    }),
    201,
  );

beforeEach(async () => {
  t = await setup();
  ana = await signUpVerified(t);
  nubank = await json<Account>(
    send("POST", "/api/accounts", { name: "Nubank", kind: "checking", initialBalanceCents: 1_000_000 }),
    201,
  );
  cats = await json<Category[]>(t.req("/api/categories", { cookie: ana }));
});
afterEach(async () => t?.close());

describe("futuro", () => {
  it("bate com a projeção e usa só o gasto variável dos 3 meses fechados", async () => {
    // variável: 3 meses de Restaurantes (o último mais alto)
    for (const [k, v] of [
      [1, 60_000],
      [2, 30_000],
      [3, 30_000],
    ] as const) {
      await expense(v, `${addYearMonth(month, -k)}-10`, "Restaurantes");
    }
    // fixos: parcela e recorrência não entram no variável
    const card = await json<Account>(
      send("POST", "/api/accounts", {
        name: "Cartão",
        kind: "credit_card",
        creditLimitCents: 1_000_000,
        closingDay: 5,
        dueDay: 12,
        payFromAccountId: nubank.id,
      }),
      201,
    );
    await expense(90_000, `${addYearMonth(month, -2)}-05`, "Compras", {
      installments: 3,
      accountId: card.id,
    });
    await json(
      send("POST", "/api/recurring", {
        kind: "expense",
        amountCents: 4_000,
        accountId: nubank.id,
        categoryId: cat("Assinaturas"),
        description: "Streaming",
        startDate: `${addYearMonth(month, -3)}-01`,
      }),
      201,
    );

    const [f, p] = await Promise.all([
      future(),
      json<Projection>(t.req("/api/insights/projection?months=12", { cookie: ana })),
    ]);
    expect(f.months.map((m) => m.knownTotalCents)).toEqual(p.months.map((m) => m.totalCents));
    expect(f.variableMonthlyCents).toBe(40_000);
    expect(f.categories).toEqual([
      expect.objectContaining({ id: cat("Restaurantes"), averageCents: 40_000, lastMonthCents: 60_000 }),
    ]);
    expect(f.currentMonthVariableLeftCents).toBeGreaterThanOrEqual(0);

    // o cálculo no aparelho desconta o variável: fim do horizonte abaixo do que é certo
    const r = projectFuture(f);
    expect(r.months.at(-1)?.totalCents).toBe(
      (f.months.at(-1)?.knownTotalCents ?? 0) - f.currentMonthVariableLeftCents - 40_000 * 11,
    );
  });

  it("traz metas e caixinhas que rendem", async () => {
    await json(
      send("POST", "/api/goals", {
        name: "Viagem",
        targetCents: 1_000_000,
        initialCents: 200_000,
        box: { cdiPercent: 10000 },
      }),
      201,
    );
    const f = await future();
    expect(f.goals).toEqual([
      expect.objectContaining({ name: "Viagem", savedCents: 200_000, cdiPercent: 10000 }),
    ]);
    expect(f.goals[0]?.accountId).toBeTruthy();
    expect(f.boxes).toEqual([{ accountId: f.goals[0]?.accountId, balanceCents: 200_000, cdiPercent: 10000 }]);
  });

  it("é isolado por usuário", async () => {
    await expense(50_000, addDays(`${month}-01`, -5), "Mercado");
    const bia = await signUpVerified(t, "bia@exemplo.com");
    const f = await future(bia);
    expect(f.variableMonthlyCents).toBe(0);
    expect(f.categories).toEqual([]);
    expect(f.months[0]?.knownTotalCents).toBe(0);
  });
});
