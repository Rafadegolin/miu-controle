import type { Account } from "@miu/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setup, signUpVerified } from "./harness";

let t: Awaited<ReturnType<typeof setup>>;
let ana: string;

const send = (method: string, path: string, body?: object, cookie = ana) =>
  t.req(path, { method, cookie, ...(body ? { json: body } : {}) });
async function json<T>(res: Response | Promise<Response>, status: number): Promise<T> {
  const r = await res;
  if (r.status !== status) throw new Error(`esperava ${status}, veio ${r.status}: ${await r.text()}`);
  return (await r.json()) as T;
}

beforeEach(async () => {
  t = await setup();
  ana = await signUpVerified(t);
});
afterEach(async () => t?.close());

describe("banco e bandeira nas contas", () => {
  it("grava banco na conta e banco + bandeira no cartão", async () => {
    await json(
      send("POST", "/api/accounts", { name: "Nubank", kind: "checking", institution: "nubank" }),
      201,
    );
    await json(
      send("POST", "/api/accounts", {
        name: "Cartão Itaú",
        kind: "credit_card",
        creditLimitCents: 500_000,
        closingDay: 5,
        dueDay: 12,
        institution: "itau",
        cardBrand: "visa",
      }),
      201,
    );
    const list = await json<Account[]>(send("GET", "/api/accounts"), 200);
    expect(list.map((a) => [a.name, a.institution, a.cardBrand])).toEqual([
      ["Nubank", "nubank", null],
      ["Cartão Itaú", "itau", "visa"],
    ]);
  });

  it("recusa banco desconhecido e bandeira fora de cartão", async () => {
    await json(
      send("POST", "/api/accounts", { name: "X", kind: "checking", institution: "banco-falso" }),
      400,
    );
    await json(send("POST", "/api/accounts", { name: "X", kind: "checking", cardBrand: "visa" }), 400);
    const conta = await json<Account>(
      send("POST", "/api/accounts", { name: "Conta", kind: "checking" }),
      201,
    );
    await json(send("PATCH", `/api/accounts/${conta.id}`, { cardBrand: "elo" }), 400);
  });

  it("edita e limpa com null; outra pessoa não altera", async () => {
    const conta = await json<Account>(
      send("POST", "/api/accounts", { name: "Conta", kind: "checking", institution: "inter" }),
      201,
    );
    const trocada = await json<Account>(
      send("PATCH", `/api/accounts/${conta.id}`, { institution: "c6" }),
      200,
    );
    expect(trocada.institution).toBe("c6");
    const limpa = await json<Account>(send("PATCH", `/api/accounts/${conta.id}`, { institution: null }), 200);
    expect(limpa.institution).toBeNull();

    const bia = await signUpVerified(t, "bia@exemplo.com");
    await json(send("PATCH", `/api/accounts/${conta.id}`, { institution: "nubank" }, bia), 404);
    const [mine] = await json<Account[]>(send("GET", "/api/accounts"), 200);
    expect(mine?.institution).toBeNull();
  });
});
