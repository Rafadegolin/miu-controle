import { addDays, addMonths, addYearMonth, makeDate, todayIn } from "@miu/core";
import type { Account, CashflowMonth, Category, CategoryReport, Dashboard } from "@miu/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setup, signUpVerified } from "./harness";

let t: Awaited<ReturnType<typeof setup>>;
let ana: string;
let conta: Account;
let reserva: Account;
let cats: Category[];
const today = todayIn("America/Sao_Paulo");
const month = today.slice(0, 7);
const monthEnd = makeDate(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 31);

async function json<T>(res: Response | Promise<Response>, status = 200): Promise<T> {
  const r = await res;
  if (r.status !== status) throw new Error(`esperava ${status}, veio ${r.status}: ${await r.text()}`);
  return (await r.json()) as T;
}
const post = <T>(path: string, body: object = {}, status = 201) =>
  json<T>(t.req(path, { method: "POST", cookie: ana, json: body }), status);
const cat = (name: string) => cats.find((c) => c.name === name)?.id ?? "";
const dashboard = () => json<Dashboard>(t.req("/api/dashboard", { cookie: ana }));
const tx = (body: object) => post("/api/transactions", { date: today, ...body });

beforeEach(async () => {
  t = await setup();
  ana = await signUpVerified(t);
  conta = await post<Account>("/api/accounts", {
    name: "Conta",
    kind: "checking",
    initialBalanceCents: 500_000,
  });
  reserva = await post<Account>("/api/accounts", {
    name: "Reserva",
    kind: "savings",
    initialBalanceCents: 100_000,
  });
  cats = await json<Category[]>(t.req("/api/categories", { cookie: ana }));
});
afterEach(async () => t?.close());

describe("painel", () => {
  it("saldo previsto = contas + previstos do mês nas contas − faturas que vencem no mês", async () => {
    // realizado
    await tx({ kind: "expense", amountCents: 20_000, accountId: conta.id, categoryId: cat("Mercado") });
    // previstos no mês, nas contas
    await tx({
      kind: "income",
      amountCents: 300_000,
      accountId: conta.id,
      categoryId: cat("Freelas"),
      status: "planned",
    });
    await tx({
      kind: "expense",
      amountCents: 50_000,
      accountId: conta.id,
      categoryId: cat("Moradia"),
      status: "planned",
    });
    // previsto atrasado também conta (ainda vai acontecer)
    await tx({
      kind: "expense",
      amountCents: 7_000,
      accountId: conta.id,
      categoryId: cat("Saúde"),
      date: addDays(today, -3) < `${month}-01` ? today : addDays(today, -3),
      status: "planned",
    });
    // transferência prevista entre contas não muda o total
    await tx({
      kind: "transfer",
      amountCents: 40_000,
      accountId: conta.id,
      toAccountId: reserva.id,
      status: "planned",
    });
    // previsto do mês que vem não entra
    await tx({
      kind: "expense",
      amountCents: 99_999,
      accountId: conta.id,
      categoryId: cat("Lazer"),
      date: addDays(monthEnd, 1),
    });

    const d = await dashboard();
    expect(d.bankBalanceCents).toBe(600_000 - 20_000);
    expect(d.projectedEndCents).toBe(580_000 + 300_000 - 50_000 - 7_000);
    expect(d.totals).toMatchObject({ expensePostedCents: 20_000, incomePlannedCents: 300_000 });
  });

  it("fatura que vence no mês sai do previsto; compra prevista no cartão não conta duas vezes", async () => {
    // fechamento ontem → a fatura do mês já fechou e vence até o fim do mês
    const closing = Math.min(28, Math.max(1, Number(today.slice(8, 10)) - 1));
    const cartao = await post<Account>("/api/accounts", {
      name: "Cartão",
      kind: "credit_card",
      creditLimitCents: 500_000,
      closingDay: closing,
      dueDay: 28,
    });
    // compra antes do fechamento (cai na fatura do mês)
    const purchaseDate = `${month}-${String(Math.max(1, closing - 1)).padStart(2, "0")}`;
    await tx({
      kind: "expense",
      amountCents: 30_000,
      accountId: cartao.id,
      categoryId: cat("Compras"),
      date: purchaseDate,
    });
    await tx({
      kind: "expense",
      amountCents: 1_000,
      accountId: cartao.id,
      categoryId: cat("Compras"),
      status: "planned",
    });

    const d = await dashboard();
    const due = d.cards[0]?.statement;
    if (due && due.dueDate <= monthEnd && due.remainingCents > 0) {
      expect(d.cardsDueThisMonthCents).toBe(due.remainingCents);
      expect(d.projectedEndCents).toBe(d.bankBalanceCents - due.remainingCents);
    } else {
      expect(d.projectedEndCents).toBe(d.bankBalanceCents);
    }
    expect(d.cards[0]?.availableCents).toBe(500_000 - 30_000);
  });

  it("lista o que vem nos próximos 15 dias e os últimos lançamentos", async () => {
    await tx({
      kind: "expense",
      amountCents: 1_000,
      accountId: conta.id,
      categoryId: cat("Mercado"),
      description: "Pão",
    });
    await tx({
      kind: "expense",
      amountCents: 2_000,
      accountId: conta.id,
      categoryId: cat("Moradia"),
      description: "Luz",
      date: addDays(today, 5),
    });
    await tx({
      kind: "expense",
      amountCents: 3_000,
      accountId: conta.id,
      categoryId: cat("Moradia"),
      description: "Longe",
      date: addDays(today, 40),
    });
    const d = await dashboard();
    expect(d.recent.map((r) => r.description)).toEqual(["Pão"]);
    const names = d.upcoming.flatMap((u) => (u.type === "transaction" ? [u.transaction.description] : []));
    expect(names).toContain("Luz");
    expect(names).not.toContain("Longe");
    expect(d.topCategories[0]).toMatchObject({ categoryId: cat("Mercado"), totalCents: 1_000 });
  });
});

describe("relatórios", () => {
  it("fluxo mês a mês com previsto separado, sem transferências", async () => {
    await tx({ kind: "income", amountCents: 100_000, accountId: conta.id, categoryId: cat("Salário") });
    await tx({ kind: "expense", amountCents: 30_000, accountId: conta.id, categoryId: cat("Mercado") });
    await tx({
      kind: "expense",
      amountCents: 5_000,
      accountId: conta.id,
      categoryId: cat("Mercado"),
      status: "planned",
    });
    await tx({ kind: "transfer", amountCents: 70_000, accountId: conta.id, toAccountId: reserva.id });
    await tx({
      kind: "expense",
      amountCents: 10_000,
      accountId: conta.id,
      categoryId: cat("Lazer"),
      date: addMonths(today, -1),
    });

    const flow = await json<CashflowMonth[]>(
      t.req(`/api/reports/cashflow?end=${month}&months=12`, { cookie: ana }),
    );
    expect(flow).toHaveLength(12);
    expect(flow.at(-1)).toEqual({
      month,
      incomeCents: 100_000,
      expenseCents: 35_000,
      plannedIncomeCents: 0,
      plannedExpenseCents: 5_000,
    });
    expect(flow.at(-2)).toMatchObject({ month: addYearMonth(month, -1), expenseCents: 10_000 });
  });

  it("categorias do mês com a média dos 3 anteriores", async () => {
    await tx({ kind: "expense", amountCents: 60_000, accountId: conta.id, categoryId: cat("Mercado") });
    for (let i = 1; i <= 3; i++) {
      await tx({
        kind: "expense",
        amountCents: 30_000,
        accountId: conta.id,
        categoryId: cat("Mercado"),
        date: addMonths(today, -i),
      });
    }
    const r = await json<CategoryReport>(t.req(`/api/reports/categories?month=${month}`, { cookie: ana }));
    expect(r.rows[0]).toEqual({ categoryId: cat("Mercado"), totalCents: 60_000, averageCents: 30_000 });
    expect(r.totalExpenseCents).toBe(60_000);
  });

  it("não mistura dados de outro usuário", async () => {
    await tx({ kind: "expense", amountCents: 60_000, accountId: conta.id, categoryId: cat("Mercado") });
    const bia = await signUpVerified(t, "bia@exemplo.com");
    const d = await json<Dashboard>(t.req("/api/dashboard", { cookie: bia }));
    expect(d).toMatchObject({ bankBalanceCents: 0, recent: [], topCategories: [] });
    const flow = await json<CashflowMonth[]>(t.req(`/api/reports/cashflow?end=${month}`, { cookie: bia }));
    expect(flow.every((m) => m.expenseCents === 0)).toBe(true);
  });
});
