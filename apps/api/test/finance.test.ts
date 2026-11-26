import { todayIn } from "@miu/core";
import type { Account, Category, MonthSummary, Transaction, TransactionPage } from "@miu/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setup, signUpVerified } from "./harness";

let t: Awaited<ReturnType<typeof setup>>;
let ana: string;
afterEach(async () => t?.close());
beforeEach(async () => {
  t = await setup();
  ana = await signUpVerified(t, "ana@exemplo.com");
});

const today = todayIn("America/Sao_Paulo");
const month = today.slice(0, 7);

async function json<T>(res: Response | Promise<Response>, status = 200): Promise<T> {
  const r = await res;
  if (r.status !== status) throw new Error(`esperava ${status}, veio ${r.status}: ${await r.text()}`);
  return (await r.json()) as T;
}

const createAccount = (cookie: string, body: object) =>
  json<Account>(t.req("/api/accounts", { method: "POST", cookie, json: body }), 201);
const createTx = (cookie: string, body: object) =>
  json<Transaction>(t.req("/api/transactions", { method: "POST", cookie, json: body }), 201);
const categories = (cookie: string) => json<Category[]>(t.req("/api/categories", { cookie }));
const accounts = (cookie: string) => json<Account[]>(t.req("/api/accounts", { cookie }));
const balanceOf = async (cookie: string, id: string) =>
  (await accounts(cookie)).find((a) => a.id === id)?.balanceCents;

describe("categorias", () => {
  it("todo usuário novo já tem as categorias padrão", async () => {
    const cats = await categories(ana);
    expect(cats.filter((c) => c.kind === "expense").map((c) => c.name)).toContain("Mercado");
    expect(cats.filter((c) => c.kind === "income").map((c) => c.name)).toContain("Salário");
  });

  it("arquiva sem apagar e cria categoria nova", async () => {
    const [first] = await categories(ana);
    const arch = await json<Category>(
      t.req(`/api/categories/${first?.id}/archive`, { method: "POST", cookie: ana }),
    );
    expect(arch.archived).toBe(true);
    const nova = await json<Category>(
      t.req("/api/categories", {
        method: "POST",
        cookie: ana,
        json: { name: "Pets", kind: "expense", icon: "paw-print" },
      }),
      201,
    );
    expect(nova).toMatchObject({ name: "Pets", icon: "paw-print", archived: false });
  });
});

describe("saldo derivado", () => {
  it("soma receitas, desconta despesas, move transferências e ignora previstos", async () => {
    const conta = await createAccount(ana, {
      name: "Conta principal",
      kind: "checking",
      initialBalanceCents: 100000,
    });
    const reserva = await createAccount(ana, { name: "Reserva", kind: "savings" });
    const cats = await categories(ana);
    const salario = cats.find((c) => c.name === "Salário")?.id;
    const mercado = cats.find((c) => c.name === "Mercado")?.id;

    await createTx(ana, {
      kind: "income",
      amountCents: 500000,
      accountId: conta.id,
      categoryId: salario,
      date: today,
    });
    await createTx(ana, {
      kind: "expense",
      amountCents: 12345,
      accountId: conta.id,
      categoryId: mercado,
      date: today,
    });
    await createTx(ana, {
      kind: "transfer",
      amountCents: 50000,
      accountId: conta.id,
      toAccountId: reserva.id,
      date: today,
    });
    await createTx(ana, {
      kind: "expense",
      amountCents: 99999,
      accountId: conta.id,
      categoryId: mercado,
      date: today,
      status: "planned",
    });

    expect(await balanceOf(ana, conta.id)).toBe(100000 + 500000 - 12345 - 50000);
    expect(await balanceOf(ana, reserva.id)).toBe(50000);
  });

  it("confirmar um previsto passa a contar no saldo; excluir desfaz", async () => {
    const conta = await createAccount(ana, { name: "Conta", kind: "checking" });
    const mercado = (await categories(ana)).find((c) => c.name === "Mercado")?.id;
    const prev = await createTx(ana, {
      kind: "expense",
      amountCents: 2000,
      accountId: conta.id,
      categoryId: mercado,
      date: today,
      status: "planned",
    });
    expect(await balanceOf(ana, conta.id)).toBe(0);

    const ok = await json<Transaction>(
      t.req(`/api/transactions/${prev.id}/confirm`, { method: "POST", cookie: ana }),
    );
    expect(ok.status).toBe("posted");
    expect(await balanceOf(ana, conta.id)).toBe(-2000);

    expect((await t.req(`/api/transactions/${prev.id}`, { method: "DELETE", cookie: ana })).status).toBe(204);
    expect(await balanceOf(ana, conta.id)).toBe(0);
  });

  it("editar valor e trocar de conta recalcula os dois saldos", async () => {
    const a = await createAccount(ana, { name: "A", kind: "checking" });
    const b = await createAccount(ana, { name: "B", kind: "cash" });
    const mercado = (await categories(ana)).find((c) => c.name === "Mercado")?.id;
    const tx = await createTx(ana, {
      kind: "expense",
      amountCents: 1000,
      accountId: a.id,
      categoryId: mercado,
      date: today,
    });
    await json(
      t.req(`/api/transactions/${tx.id}`, {
        method: "PATCH",
        cookie: ana,
        json: { amountCents: 1500, accountId: b.id },
      }),
    );
    expect(await balanceOf(ana, a.id)).toBe(0);
    expect(await balanceOf(ana, b.id)).toBe(-1500);
  });

  it("data futura vira previsto automaticamente", async () => {
    const conta = await createAccount(ana, { name: "Conta", kind: "checking" });
    const salario = (await categories(ana)).find((c) => c.name === "Salário")?.id;
    const tx = await createTx(ana, {
      kind: "income",
      amountCents: 1000,
      accountId: conta.id,
      categoryId: salario,
      date: "2999-01-05",
      status: "posted",
    });
    expect(tx.status).toBe("planned");
    expect(await balanceOf(ana, conta.id)).toBe(0);
  });
});

describe("validações", () => {
  it("recusa valor zero, transferência para a mesma conta e categoria do tipo errado", async () => {
    const conta = await createAccount(ana, { name: "Conta", kind: "checking" });
    const salario = (await categories(ana)).find((c) => c.name === "Salário")?.id;
    const base = { accountId: conta.id, date: today };

    const zero = await t.req("/api/transactions", {
      method: "POST",
      cookie: ana,
      json: { ...base, kind: "expense", amountCents: 0, categoryId: salario },
    });
    expect(zero.status).toBe(400);

    const mesma = await t.req("/api/transactions", {
      method: "POST",
      cookie: ana,
      json: { ...base, kind: "transfer", amountCents: 10, toAccountId: conta.id },
    });
    expect(mesma.status).toBe(400);

    const tipoErrado = await t.req("/api/transactions", {
      method: "POST",
      cookie: ana,
      json: { ...base, kind: "expense", amountCents: 10, categoryId: salario },
    });
    expect(tipoErrado.status).toBe(400);
    expect(await tipoErrado.json()).toMatchObject({ erro: "categoria_incompativel" });
  });

  it("não deixa excluir conta com lançamentos (sugere arquivar)", async () => {
    const conta = await createAccount(ana, { name: "Conta", kind: "checking" });
    const mercado = (await categories(ana)).find((c) => c.name === "Mercado")?.id;
    await createTx(ana, {
      kind: "expense",
      amountCents: 10,
      accountId: conta.id,
      categoryId: mercado,
      date: today,
    });
    const res = await t.req(`/api/accounts/${conta.id}`, { method: "DELETE", cookie: ana });
    expect(res.status).toBe(409);
    expect((await t.req(`/api/accounts/${conta.id}/archive`, { method: "POST", cookie: ana })).status).toBe(
      200,
    );
  });

  it("não aceita lançar em conta arquivada", async () => {
    const conta = await createAccount(ana, { name: "Conta", kind: "checking" });
    await t.req(`/api/accounts/${conta.id}/archive`, { method: "POST", cookie: ana });
    const mercado = (await categories(ana)).find((c) => c.name === "Mercado")?.id;
    const res = await t.req("/api/transactions", {
      method: "POST",
      cookie: ana,
      json: { kind: "expense", amountCents: 10, accountId: conta.id, categoryId: mercado, date: today },
    });
    expect(res.status).toBe(404);
  });
});

describe("lista e resumo do mês", () => {
  it("pagina por cursor sem repetir nem pular itens, e filtra", async () => {
    const conta = await createAccount(ana, { name: "Conta", kind: "checking" });
    const mercado = (await categories(ana)).find((c) => c.name === "Mercado")?.id;
    for (let i = 1; i <= 7; i++) {
      await createTx(ana, {
        kind: "expense",
        amountCents: i * 100,
        accountId: conta.id,
        categoryId: mercado,
        date: `${month}-0${Math.min(i, 9)}`.slice(0, 10),
        description: i === 3 ? "Padaria 100% integral" : `Compra ${i}`,
      });
    }
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const qs = new URLSearchParams({ month, limit: "3", ...(cursor ? { cursor } : {}) });
      const page: TransactionPage = await json(t.req(`/api/transactions?${qs}`, { cookie: ana }));
      seen.push(...page.items.map((i) => i.id));
      cursor = page.nextCursor;
    } while (cursor);
    expect(seen).toHaveLength(7);
    expect(new Set(seen).size).toBe(7);

    const busca: TransactionPage = await json(
      t.req(`/api/transactions?month=${month}&q=${encodeURIComponent("100%")}`, { cookie: ana }),
    );
    expect(busca.items.map((i) => i.description)).toEqual(["Padaria 100% integral"]);
  });

  it("resume receitas e despesas realizadas e previstas, por categoria", async () => {
    const conta = await createAccount(ana, { name: "Conta", kind: "checking" });
    const cats = await categories(ana);
    const mercado = cats.find((c) => c.name === "Mercado")?.id;
    const salario = cats.find((c) => c.name === "Salário")?.id;
    const reserva = await createAccount(ana, { name: "Reserva", kind: "savings" });
    await createTx(ana, {
      kind: "income",
      amountCents: 1000,
      accountId: conta.id,
      categoryId: salario,
      date: today,
    });
    await createTx(ana, {
      kind: "expense",
      amountCents: 300,
      accountId: conta.id,
      categoryId: mercado,
      date: today,
    });
    await createTx(ana, {
      kind: "expense",
      amountCents: 200,
      accountId: conta.id,
      categoryId: mercado,
      date: today,
      status: "planned",
    });
    await createTx(ana, {
      kind: "transfer",
      amountCents: 999,
      accountId: conta.id,
      toAccountId: reserva.id,
      date: today,
    });

    const s = await json<MonthSummary>(t.req(`/api/transactions/summary?month=${month}`, { cookie: ana }));
    expect(s).toMatchObject({
      incomePostedCents: 1000,
      expensePostedCents: 300,
      expensePlannedCents: 200,
      byCategory: [{ categoryId: mercado, postedCents: 300, plannedCents: 200 }],
    });
  });
});

describe("isolamento entre usuários", () => {
  it("um usuário não vê, não usa e não altera nada de outro", async () => {
    const conta = await createAccount(ana, {
      name: "Conta da Ana",
      kind: "checking",
      initialBalanceCents: 5000,
    });
    const anaCats = await categories(ana);
    const mercado = anaCats.find((c) => c.name === "Mercado")?.id;
    const tx = await createTx(ana, {
      kind: "expense",
      amountCents: 100,
      accountId: conta.id,
      categoryId: mercado,
      date: today,
    });

    const bia = await signUpVerified(t, "bia@exemplo.com");
    const biaConta = await createAccount(bia, { name: "Conta da Bia", kind: "checking" });

    expect(await accounts(bia)).toEqual([expect.objectContaining({ id: biaConta.id })]);
    expect((await categories(bia)).some((c) => anaCats.some((a) => a.id === c.id))).toBe(false);
    const lista: TransactionPage = await json(t.req(`/api/transactions?month=${month}`, { cookie: bia }));
    expect(lista.items).toEqual([]);

    const tentativas = [
      t.req(`/api/accounts/${conta.id}`, { method: "PATCH", cookie: bia, json: { name: "hack" } }),
      t.req(`/api/accounts/${conta.id}/archive`, { method: "POST", cookie: bia }),
      t.req(`/api/accounts/${conta.id}`, { method: "DELETE", cookie: bia }),
      t.req(`/api/categories/${mercado}`, { method: "PATCH", cookie: bia, json: { name: "hack" } }),
      t.req(`/api/transactions/${tx.id}`, { method: "PATCH", cookie: bia, json: { amountCents: 1 } }),
      t.req(`/api/transactions/${tx.id}/confirm`, { method: "POST", cookie: bia }),
      t.req(`/api/transactions/${tx.id}`, { method: "DELETE", cookie: bia }),
      // usar conta/categoria da Ana num lançamento da Bia
      t.req("/api/transactions", {
        method: "POST",
        cookie: bia,
        json: { kind: "expense", amountCents: 1, accountId: conta.id, categoryId: mercado, date: today },
      }),
      t.req("/api/transactions", {
        method: "POST",
        cookie: bia,
        json: {
          kind: "transfer",
          amountCents: 1,
          accountId: biaConta.id,
          toAccountId: conta.id,
          date: today,
        },
      }),
    ];
    for (const res of await Promise.all(tentativas)) expect(res.status).toBe(404);

    // nada da Ana mudou
    expect(await balanceOf(ana, conta.id)).toBe(4900);
    expect((await accounts(ana))[0]?.name).toBe("Conta da Ana");
  });
});
