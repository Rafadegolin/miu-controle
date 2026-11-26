import { todayIn } from "@miu/core";
import { eq, schema } from "@miu/db";
import type { Account, Category, Transaction } from "@miu/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setup, signUpVerified } from "./harness";

let t: Awaited<ReturnType<typeof setup>>;
let ana: string;
let conta: Account;
let cats: Category[];
const today = todayIn("America/Sao_Paulo");

const send = (body: object, cookie = ana) =>
  t.req("/api/transactions", { method: "POST", cookie, json: body });
async function json<T>(res: Response | Promise<Response>, status: number): Promise<T> {
  const r = await res;
  if (r.status !== status) throw new Error(`esperava ${status}, veio ${r.status}: ${await r.text()}`);
  return (await r.json()) as T;
}
const expense = (extra: object = {}) => ({
  kind: "expense",
  amountCents: 4500,
  accountId: conta.id,
  categoryId: cats.find((c) => c.name === "Restaurantes")?.id,
  date: today,
  description: "iFood",
  ...extra,
});
const rowsOf = async (userId?: string) => {
  const all = await t.db.select().from(schema.transactions);
  return userId ? all.filter((r) => r.userId === userId) : all;
};

beforeEach(async () => {
  t = await setup();
  ana = await signUpVerified(t);
  conta = await json<Account>(
    t.req("/api/accounts", { method: "POST", cookie: ana, json: { name: "Conta", kind: "checking" } }),
    201,
  );
  cats = await json<Category[]>(t.req("/api/categories", { cookie: ana }), 200);
});
afterEach(async () => t?.close());

describe("fila offline: lançamento com clientId", () => {
  it("o id do aparelho vira o id do lançamento e reenviar não duplica", async () => {
    const clientId = crypto.randomUUID();
    const first = await json<Transaction>(send(expense({ clientId })), 201);
    expect(first.id).toBe(clientId);
    const again = await json<Transaction>(send(expense({ clientId })), 200);
    expect(again.id).toBe(clientId);
    expect(await rowsOf()).toHaveLength(1);
  });

  it("vale também para parcelas e transferências", async () => {
    const cartao = await json<Account>(
      t.req("/api/accounts", {
        method: "POST",
        cookie: ana,
        json: { name: "Cartão", kind: "credit_card", creditLimitCents: 500_000, closingDay: 5, dueDay: 12 },
      }),
      201,
    );
    const parc = crypto.randomUUID();
    await json(
      send(expense({ clientId: parc, accountId: cartao.id, amountCents: 30_000, installments: 3 })),
      201,
    );
    await json(
      send(expense({ clientId: parc, accountId: cartao.id, amountCents: 30_000, installments: 3 })),
      200,
    );
    expect((await rowsOf()).filter((r) => r.installmentGroupId)).toHaveLength(3);

    const reserva = await json<Account>(
      t.req("/api/accounts", { method: "POST", cookie: ana, json: { name: "Reserva", kind: "savings" } }),
      201,
    );
    const tr = crypto.randomUUID();
    const body = {
      clientId: tr,
      kind: "transfer",
      amountCents: 1000,
      accountId: conta.id,
      toAccountId: reserva.id,
      date: today,
      description: "Guardar",
    };
    await json(send(body), 201);
    await json(send(body), 200);
    expect((await rowsOf()).filter((r) => r.kind === "transfer")).toHaveLength(1);
  });

  it("clientId de outra pessoa é recusado sem revelar nada; formato inválido dá 400", async () => {
    const clientId = crypto.randomUUID();
    await json(send(expense({ clientId })), 201);
    const bia = await signUpVerified(t, "bia@exemplo.com");
    const biaConta = await json<Account>(
      t.req("/api/accounts", { method: "POST", cookie: bia, json: { name: "Bia", kind: "checking" } }),
      201,
    );
    const biaCats = await json<Category[]>(t.req("/api/categories", { cookie: bia }), 200);
    const res = await send(
      { ...expense({ clientId }), accountId: biaConta.id, categoryId: biaCats[0]?.id },
      bia,
    );
    expect(res.status).toBe(409);
    const text = await res.text();
    expect(text).not.toContain("iFood");
    expect(text).not.toContain("4500");
    const [biaUser] = await t.db.select().from(schema.user).where(eq(schema.user.email, "bia@exemplo.com"));
    expect(await rowsOf(biaUser?.id)).toHaveLength(0);

    await json(send(expense({ clientId: "nao-e-uuid" })), 400);
  });
});
