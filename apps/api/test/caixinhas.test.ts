import { addYearMonth, daysInMonth, monthYield, todayIn } from "@miu/core";
import { and, eq, schema } from "@miu/db";
import type { Account, Dashboard, Goal, GoalContribution } from "@miu/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { postYields, syncCdi } from "../src/lib/yields";
import { setup, signUpVerified } from "./harness";

let t: Awaited<ReturnType<typeof setup>>;
let ana: string;
let conta: Account;
const today = todayIn("America/Sao_Paulo");

async function json<T>(res: Response | Promise<Response>, status: number): Promise<T> {
  const r = await res;
  if (r.status !== status) throw new Error(`esperava ${status}, veio ${r.status}: ${await r.text()}`);
  return (await r.json()) as T;
}
const send = (method: string, path: string, body?: object, cookie = ana) =>
  t.req(path, { method, cookie, ...(body ? { json: body } : {}) });
const accounts = (cookie = ana) => json<Account[]>(t.req("/api/accounts", { cookie }), 200);
const caixinha = (extra: object = {}) =>
  json<Goal>(
    send("POST", "/api/goals", {
      name: "Viagem",
      targetCents: 1_000_000,
      initialCents: 100_000,
      box: { cdiPercent: 10000 },
      ...extra,
    }),
    201,
  );

beforeEach(async () => {
  t = await setup();
  ana = await signUpVerified(t);
  conta = await json<Account>(
    send("POST", "/api/accounts", { name: "Nubank", kind: "checking", initialBalanceCents: 500_000 }),
    201,
  );
});
afterEach(async () => t?.close());

describe("meta como caixinha", () => {
  it("cria a conta-caixinha com o que já está guardado e % do CDI", async () => {
    const g = await caixinha();
    expect(g.savedCents).toBe(100_000);
    expect(g.box).toMatchObject({ accountName: "Caixinha Viagem", cdiPercent: 10000 });
    const box = (await accounts()).find((a) => a.id === g.box?.accountId);
    expect(box).toMatchObject({ kind: "savings", cdiPercent: 10000, balanceCents: 100_000 });
  });

  it("guardar e resgatar são transferências: o saldo da conta muda junto", async () => {
    const g = await caixinha();
    let after = await json<Goal>(
      send("POST", `/api/goals/${g.id}/move`, {
        direction: "in",
        amountCents: 50_000,
        accountId: conta.id,
        date: today,
      }),
      201,
    );
    expect(after.savedCents).toBe(150_000);
    after = await json<Goal>(
      send("POST", `/api/goals/${g.id}/move`, {
        direction: "out",
        amountCents: 20_000,
        accountId: conta.id,
        date: today,
      }),
      201,
    );
    expect(after.savedCents).toBe(130_000);
    expect((await accounts()).find((a) => a.id === conta.id)?.balanceCents).toBe(500_000 - 50_000 + 20_000);

    await json(
      send("POST", `/api/goals/${g.id}/move`, {
        direction: "out",
        amountCents: 999_999,
        accountId: conta.id,
        date: today,
      }),
      400,
    );
    await json(send("POST", `/api/goals/${g.id}/contributions`, { amountCents: 100, date: today }), 400);

    const hist = await json<GoalContribution[]>(
      t.req(`/api/goals/${g.id}/contributions`, { cookie: ana }),
      200,
    );
    expect(hist.map((h) => h.amountCents).sort((a, b) => a - b)).toEqual([-20_000, 50_000]);
    expect(hist.every((h) => h.fromBox)).toBe(true);
  });

  it("meta simples continua como antes e pode virar caixinha", async () => {
    const g = await json<Goal>(
      send("POST", "/api/goals", { name: "Carro", targetCents: 500_000, initialCents: 30_000 }),
      201,
    );
    expect(g.box).toBeNull();
    const conv = await json<Goal>(send("POST", `/api/goals/${g.id}/convert`, { cdiPercent: 11000 }), 200);
    expect(conv).toMatchObject({ savedCents: 30_000, box: { cdiPercent: 11000 } });
    await json(send("POST", `/api/goals/${g.id}/convert`, { cdiPercent: null }), 400);
  });

  it("a Visão geral mostra o saldo da caixinha na meta em destaque", async () => {
    const g = await caixinha();
    await json(
      send("POST", `/api/goals/${g.id}/move`, {
        direction: "in",
        amountCents: 25_000,
        accountId: conta.id,
        date: today,
      }),
      201,
    );
    const d = await json<Dashboard>(t.req("/api/dashboard", { cookie: ana }), 200);
    expect(d.goalHighlight).toMatchObject({ id: g.id, savedCents: 125_000 });
  });

  it("é isolado por usuário", async () => {
    const g = await caixinha();
    const bia = await signUpVerified(t, "bia@exemplo.com");
    const biaConta = await json<Account>(
      send("POST", "/api/accounts", { name: "Bia", kind: "checking" }, bia),
      201,
    );
    await json(
      send(
        "POST",
        `/api/goals/${g.id}/move`,
        { direction: "in", amountCents: 100, accountId: biaConta.id, date: today },
        bia,
      ),
      404,
    );
    await json(
      send("POST", `/api/goals/${g.id}/move`, {
        direction: "in",
        amountCents: 100,
        accountId: biaConta.id,
        date: today,
      }),
      404,
    );
    expect((await accounts(bia)).length).toBe(1);
  });
});

describe("CDI e rendimento", () => {
  it("busca o CDI no Banco Central e não quebra se a rede falhar", async () => {
    const fake = async () =>
      new Response(
        JSON.stringify([
          { data: "02/11/2026", valor: "0.050788" },
          { data: "03/11/2026", valor: "0.050788" },
        ]),
      );
    expect(await syncCdi(t.db, fake, today)).toEqual({ saved: 2 });
    expect(await syncCdi(t.db, fake, today)).toEqual({ saved: 2 }); // de novo: atualiza, não duplica
    expect((await t.db.select().from(schema.cdiRates)).length).toBe(2);
    expect(await syncCdi(t.db, async () => Promise.reject(new Error("off")), today)).toEqual({
      saved: 0,
      erro: "bcb_rede",
    });
  });

  it("lança o rendimento do mês que acabou uma vez só, em Rendimentos", async () => {
    const g = await caixinha();
    const boxId = g.box?.accountId as string;
    const prev = addYearMonth(today.slice(0, 7), -1);
    const rates: Record<string, number> = {};
    const days = daysInMonth(Number(prev.slice(0, 4)), Number(prev.slice(5, 7)));
    for (let d = 1; d <= days; d++) {
      const date = `${prev}-${String(d).padStart(2, "0")}`;
      const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
      if (dow !== 0 && dow !== 6) rates[date] = 0.05;
    }
    await t.db
      .insert(schema.cdiRates)
      .values(Object.entries(rates).map(([date, ratePercent]) => ({ date, ratePercent })));

    expect(await postYields(t.db)).toMatchObject({ lancados: 1 });
    expect(await postYields(t.db)).toMatchObject({ lancados: 0 }); // idempotente

    const txs = await t.db
      .select()
      .from(schema.transactions)
      .where(and(eq(schema.transactions.accountId, boxId), eq(schema.transactions.kind, "income")));
    expect(txs).toHaveLength(1);
    const expected = monthYield({
      month: prev,
      openingCents: 100_000,
      changes: [],
      rates,
      cdiPercent: 10000,
    });
    expect(txs[0]?.amountCents).toBe(expected);
    const [cat] = await t.db
      .select()
      .from(schema.categories)
      .where(eq(schema.categories.id, txs[0]?.categoryId ?? ""));
    expect(cat?.name).toBe("Rendimentos");
  });

  it("ajustar com o saldo do banco lança a diferença como rendimento", async () => {
    const g = await caixinha();
    const boxId = g.box?.accountId as string;
    const acc = await json<Account>(
      send("POST", `/api/accounts/${boxId}/adjust`, { balanceCents: 101_234 }),
      200,
    );
    expect(acc.balanceCents).toBe(101_234);
    const [tx] = await t.db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.accountId, boxId));
    expect(tx).toMatchObject({
      kind: "income",
      amountCents: 1_234,
      description: "Rendimento (ajuste com o saldo do banco)",
    });
    // % do CDI só em poupança/investimento
    await json(send("PATCH", `/api/accounts/${conta.id}`, { cdiPercent: 10000 }), 400);
  });
});
