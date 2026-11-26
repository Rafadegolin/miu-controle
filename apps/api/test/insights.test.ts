import { addDays, addMonths, addYearMonth, todayIn } from "@miu/core";
import type { Account, Category, Dashboard, Me, Pace } from "@miu/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setup, signUpVerified } from "./harness";

let t: Awaited<ReturnType<typeof setup>>;
let ana: string;
let conta: Account;
let cats: Category[];
const today = todayIn("America/Sao_Paulo");
const month = today.slice(0, 7);
const day = Number(today.slice(8, 10));

async function json<T>(res: Response | Promise<Response>, status = 200): Promise<T> {
  const r = await res;
  if (r.status !== status) throw new Error(`esperava ${status}, veio ${r.status}: ${await r.text()}`);
  return (await r.json()) as T;
}
const post = <T>(path: string, body: object = {}, status = 201) =>
  json<T>(t.req(path, { method: "POST", cookie: ana, json: body }), status);
const cat = (name: string) => cats.find((c) => c.name === name)?.id ?? "";
const spend = (amountCents: number, date: string, extra: object = {}) =>
  post("/api/transactions", {
    kind: "expense",
    amountCents,
    accountId: conta.id,
    categoryId: cat("Mercado"),
    date,
    ...extra,
  });

beforeEach(async () => {
  t = await setup();
  ana = await signUpVerified(t);
  conta = await post<Account>("/api/accounts", {
    name: "Conta",
    kind: "checking",
    initialBalanceCents: 1_000_000,
  });
  cats = await json<Category[]>(t.req("/api/categories", { cookie: ana }));
});
afterEach(async () => t?.close());

describe("ritmo de gastos", () => {
  it("acumula o mês até hoje e compara com o mês passado até o mesmo dia", async () => {
    await spend(30_000, `${month}-01`);
    await spend(20_000, today);
    const prevMonth = addYearMonth(month, -1);
    await spend(40_000, `${prevMonth}-01`);
    // depois do mesmo dia no mês passado: não entra no "até o mesmo dia"
    if (day < 28) await spend(99_000, `${prevMonth}-28`);

    const p = await json<Pace>(t.req("/api/insights/pace", { cookie: ana }));
    expect(p).toMatchObject({
      month,
      isCurrentMonth: true,
      day,
      spentCents: 50_000,
      previousToDateCents: 40_000,
    });
    expect(p.current).toHaveLength(day);
    expect(p.current.at(-1)).toBe(50_000);
    expect(p.differenceCents).toBe(10_000);
    expect(p.status).toBe("above");
    expect(p.limitCents).toBeNull();
  });

  it("não conta transferência, previsto nem estorno; cartão entra pela data da compra", async () => {
    const reserva = await post<Account>("/api/accounts", { name: "Reserva", kind: "savings" });
    const cartao = await post<Account>("/api/accounts", {
      name: "Cartão",
      kind: "credit_card",
      creditLimitCents: 100_000,
      closingDay: 3,
      dueDay: 10,
    });
    await spend(1_000, today);
    await spend(2_000, today, { accountId: cartao.id });
    await spend(5_000, addDays(today, 40)); // futuro: previsto
    await post("/api/transactions", {
      kind: "transfer",
      amountCents: 7_000,
      accountId: conta.id,
      toAccountId: reserva.id,
      date: today,
    });
    const p = await json<Pace>(t.req("/api/insights/pace", { cookie: ana }));
    expect(p.spentCents).toBe(3_000);
  });

  it("com limite: quanto falta e quanto dá por dia (descontando o previsto)", async () => {
    const me = await json<Me>(
      t.req("/api/me", { method: "PATCH", cookie: ana, json: { monthlySpendingLimitCents: 300_000 } }),
    );
    expect(me.settings.monthlySpendingLimitCents).toBe(300_000);
    await spend(100_000, today);
    const p = await json<Pace>(t.req("/api/insights/pace", { cookie: ana }));
    expect(p).toMatchObject({ limitCents: 300_000, remainingCents: 200_000 });
    expect(p.dailyAllowanceCents).toBe(Math.floor(200_000 / p.daysLeft));
  });

  it("sugere a média dos 3 meses anteriores e aceita mês passado (série completa)", async () => {
    for (let i = 1; i <= 3; i++) await spend(30_000 * i, addMonths(today, -i));
    const p = await json<Pace>(t.req("/api/insights/pace", { cookie: ana }));
    expect(p.averageCents).toBe(60_000);
    const past = await json<Pace>(
      t.req(`/api/insights/pace?month=${addYearMonth(month, -1)}`, { cookie: ana }),
    );
    expect(past).toMatchObject({ isCurrentMonth: false, daysLeft: 0, spentCents: 30_000 });
    expect(past.current).toHaveLength(past.daysInMonth);
  });

  it("é isolado por usuário", async () => {
    await spend(10_000, today);
    const bia = await signUpVerified(t, "bia@exemplo.com");
    const p = await json<Pace>(t.req("/api/insights/pace", { cookie: bia }));
    expect(p.spentCents).toBe(0);
    expect((await t.req("/api/insights/pace")).status).toBe(401);
  });
});

describe("painel: mês anterior e meta em destaque", () => {
  it("traz os totais do mês anterior e a meta mais perto de concluir", async () => {
    await spend(12_000, addMonths(today, -1));
    const perto = await post<{ id: string }>("/api/goals", {
      name: "Viagem",
      targetCents: 10_000,
      initialCents: 9_000,
    });
    await post("/api/goals", { name: "Carro", targetCents: 100_000, initialCents: 1_000 });
    await post("/api/goals", { name: "Pronta", targetCents: 1_000, initialCents: 1_000 });
    const d = await json<Dashboard>(t.req("/api/dashboard", { cookie: ana }));
    expect(d.previousTotals.expenseCents).toBe(12_000);
    expect(d.goalHighlight).toMatchObject({ id: perto.id, name: "Viagem", savedCents: 9_000 });
  });
});
