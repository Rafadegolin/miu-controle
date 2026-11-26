import { addDays, addMonths, todayIn } from "@miu/core";
import { eq, schema } from "@miu/db";
import type { Account, Category, RecurringRule, Transaction, TransactionPage } from "@miu/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HORIZON_DAYS, runDaily } from "../src/lib/recurring";
import { setup, signUpVerified } from "./harness";

let t: Awaited<ReturnType<typeof setup>>;
let ana: string;
let conta: Account;
let moradia: string;
let salario: string;
const today = todayIn("America/Sao_Paulo");

async function json<T>(res: Response | Promise<Response>, status = 200): Promise<T> {
  const r = await res;
  if (r.status !== status) throw new Error(`esperava ${status}, veio ${r.status}: ${await r.text()}`);
  return (await r.json()) as T;
}
const post = <T>(path: string, body: object = {}, status = 201) =>
  json<T>(t.req(path, { method: "POST", cookie: ana, json: body }), status);

/** Todas as ocorrências de uma regra, direto do banco. */
async function occurrences(ruleId: string) {
  const rows = await t.db
    .select()
    .from(schema.transactions)
    .where(eq(schema.transactions.recurringRuleId, ruleId));
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

beforeEach(async () => {
  t = await setup();
  ana = await signUpVerified(t);
  conta = await post<Account>("/api/accounts", {
    name: "Conta",
    kind: "checking",
    initialBalanceCents: 1_000_000,
  });
  const cats = await json<Category[]>(t.req("/api/categories", { cookie: ana }));
  moradia = cats.find((c) => c.name === "Moradia")?.id ?? "";
  salario = cats.find((c) => c.name === "Salário")?.id ?? "";
});
afterEach(async () => t?.close());

const aluguel = (extra: object = {}) => ({
  kind: "expense",
  amountCents: 210_000,
  accountId: conta.id,
  categoryId: moradia,
  description: "Aluguel",
  startDate: today,
  ...extra,
});

describe("recorrências", () => {
  it("gera previsões a partir da data de início (inclusive), sem mexer no saldo", async () => {
    const rule = await post<RecurringRule>("/api/recurring", aluguel());
    expect(rule).toMatchObject({
      frequency: "monthly",
      interval: 1,
      paused: false,
      nextDate: today,
      monthlyCents: 210_000,
    });
    const occ = await occurrences(rule.id);
    expect(occ[0]?.date).toBe(today);
    expect(occ.every((o) => o.status === "planned" && o.source === "recurring")).toBe(true);
    expect((occ.at(-1)?.date ?? "") <= addDays(today, HORIZON_DAYS)).toBe(true);
    const accounts = await json<Account[]>(t.req("/api/accounts", { cookie: ana }));
    expect(accounts[0]?.balanceCents).toBe(1_000_000);
  });

  it("regra que começa no passado só gera de hoje em diante (o saldo de hoje já inclui o passado)", async () => {
    const rule = await post<RecurringRule>(
      "/api/recurring",
      aluguel({ startDate: addMonths(today, -3), autoPost: true }),
    );
    const occ = await occurrences(rule.id);
    expect(occ.every((o) => o.date >= today)).toBe(true);
    const accounts = await json<Account[]>(t.req("/api/accounts", { cookie: ana }));
    expect(accounts[0]?.balanceCents).toBe(1_000_000 - (occ.some((o) => o.date === today) ? 210_000 : 0));
  });

  it("recupera dias em que a rotina não rodou (catch-up), sem pular nenhum", async () => {
    const start = addMonths(today, -3);
    const rule = await post<RecurringRule>("/api/recurring", aluguel({ startDate: start }));
    // simula 3 meses sem o cron rodar
    await t.db
      .update(schema.recurringRules)
      .set({ generatedUntil: addDays(start, -1) })
      .where(eq(schema.recurringRules.id, rule.id));
    await runDaily(t.db);
    const dates = (await occurrences(rule.id)).map((o) => o.date);
    expect(dates.slice(0, 4)).toEqual([start, addMonths(start, 1), addMonths(start, 2), addMonths(start, 3)]);
    expect(new Set(dates).size).toBe(dates.length);
  });

  it("lançamento rápido com 'repetir': a primeira já fica realizada", async () => {
    const rule = await post<RecurringRule>("/api/recurring", {
      kind: "income",
      amountCents: 780_000,
      accountId: conta.id,
      categoryId: salario,
      description: "Salário",
      startDate: today,
      firstPosted: true,
    });
    const [first, second] = await occurrences(rule.id);
    expect(first).toMatchObject({ date: today, status: "posted" });
    expect(second?.status).toBe("planned");
  });

  it("rodar a rotina diária duas vezes não duplica nada", async () => {
    const rule = await post<RecurringRule>("/api/recurring", aluguel());
    const before = (await occurrences(rule.id)).length;
    await runDaily(t.db);
    await runDaily(t.db);
    expect((await occurrences(rule.id)).length).toBe(before);
  });

  it("a rotina diária avança o horizonte e lança sozinho o que é automático", async () => {
    const rule = await post<RecurringRule>(
      "/api/recurring",
      aluguel({ description: "Internet", amountCents: 12_000, autoPost: true, startDate: addDays(today, 1) }),
    );
    expect((await occurrences(rule.id))[0]?.status).toBe("planned");

    // simula o cron rodando 40 dias no futuro
    const later = new Date(Date.now() + 40 * 86_400_000);
    const r = await runDaily(t.db, later);
    expect(r.autoPosted).toBeGreaterThanOrEqual(1);
    const occ = await occurrences(rule.id);
    const laterDay = todayIn("America/Sao_Paulo", later);
    expect(occ.filter((o) => o.date <= laterDay).every((o) => o.status === "posted")).toBe(true);
    expect((occ.at(-1)?.date ?? "") > addDays(today, HORIZON_DAYS)).toBe(true);
  });

  it("confirmar uma previsão mantém a data da ocorrência", async () => {
    const rule = await post<RecurringRule>("/api/recurring", aluguel({ startDate: addDays(today, 5) }));
    const [first] = await occurrences(rule.id);
    const ok = await post<Transaction>(`/api/transactions/${first?.id}/confirm`, {}, 200);
    expect(ok).toMatchObject({ status: "posted", date: addDays(today, 5) });
  });

  it("editar o valor muda só as previsões futuras; o realizado fica", async () => {
    const rule = await post<RecurringRule>("/api/recurring", aluguel({ firstPosted: true }));
    const [past] = await occurrences(rule.id);
    await post(`/api/transactions/${past?.id}/confirm`, {}, 200);

    await json(
      t.req(`/api/recurring/${rule.id}`, { method: "PATCH", cookie: ana, json: { amountCents: 250_000 } }),
    );
    const occ = await occurrences(rule.id);
    expect(occ.find((o) => o.id === past?.id)?.amountCents).toBe(210_000);
    expect(occ.filter((o) => o.status === "planned").every((o) => o.amountCents === 250_000)).toBe(true);
    // sem duplicar datas
    expect(new Set(occ.map((o) => o.date)).size).toBe(occ.length);
  });

  it("pausar some com as previsões futuras; retomar volta de hoje em diante", async () => {
    const rule = await post<RecurringRule>("/api/recurring", aluguel());
    const paused = await post<RecurringRule>(`/api/recurring/${rule.id}/pause`, {}, 200);
    expect(paused).toMatchObject({ paused: true, nextDate: null });
    expect((await occurrences(rule.id)).filter((o) => o.date >= today)).toHaveLength(0);

    const resumed = await post<RecurringRule>(`/api/recurring/${rule.id}/resume`, {}, 200);
    expect(resumed.paused).toBe(false);
    expect((await occurrences(rule.id)).filter((o) => o.date >= today).length).toBeGreaterThan(0);
  });

  it("excluir a regra mantém o que já aconteceu nos lançamentos", async () => {
    const rule = await post<RecurringRule>("/api/recurring", aluguel({ firstPosted: true }));
    const [past] = await occurrences(rule.id);
    expect(past?.status).toBe("posted");
    expect((await t.req(`/api/recurring/${rule.id}`, { method: "DELETE", cookie: ana })).status).toBe(204);

    const page = await json<TransactionPage>(
      t.req(`/api/transactions?month=${past?.date.slice(0, 7)}`, { cookie: ana }),
    );
    expect(page.items.find((i) => i.id === past?.id)).toMatchObject({
      status: "posted",
      description: "Aluguel",
    });
    expect(await json<RecurringRule[]>(t.req("/api/recurring", { cookie: ana }))).toEqual([]);
  });

  it("assinatura no cartão entra na fatura certa", async () => {
    const cartao = await post<Account>("/api/accounts", {
      name: "Cartão",
      kind: "credit_card",
      creditLimitCents: 100_000,
      closingDay: 3,
      dueDay: 10,
    });
    const assinaturas = (await json<Category[]>(t.req("/api/categories", { cookie: ana }))).find(
      (c) => c.name === "Assinaturas",
    )?.id;
    const rule = await post<RecurringRule>("/api/recurring", {
      kind: "expense",
      amountCents: 5_590,
      accountId: cartao.id,
      categoryId: assinaturas,
      description: "Streaming",
      startDate: today,
    });
    const [first] = await occurrences(rule.id);
    expect(first?.statementMonth).toBeTruthy();
  });

  it("valida categoria, contas e datas; outro usuário não mexe", async () => {
    const tipoErrado = await t.req("/api/recurring", {
      method: "POST",
      cookie: ana,
      json: aluguel({ categoryId: salario }),
    });
    expect(tipoErrado.status).toBe(400);
    const fimAntes = await t.req("/api/recurring", {
      method: "POST",
      cookie: ana,
      json: aluguel({ endDate: addDays(today, -1) }),
    });
    expect(fimAntes.status).toBe(400);

    const rule = await post<RecurringRule>("/api/recurring", aluguel());
    const bia = await signUpVerified(t, "bia@exemplo.com");
    expect(await json<RecurringRule[]>(t.req("/api/recurring", { cookie: bia }))).toEqual([]);
    for (const res of await Promise.all([
      t.req(`/api/recurring/${rule.id}`, { method: "PATCH", cookie: bia, json: { amountCents: 1 } }),
      t.req(`/api/recurring/${rule.id}/pause`, { method: "POST", cookie: bia }),
      t.req(`/api/recurring/${rule.id}`, { method: "DELETE", cookie: bia }),
    ])) {
      expect(res.status).toBe(404);
    }
  });
});
