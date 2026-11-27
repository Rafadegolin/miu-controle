import { describe, expect, it } from "vitest";
import { firstNegative, projectBalances } from "./projection";

const today = "2026-11-27";

describe("projeção das contas", () => {
  it("acumula eventos até o fim de cada mês, por conta", () => {
    const p = projectBalances({
      today,
      months: 3,
      balances: { nu: 100_000, itau: 50_000 },
      events: [
        { date: "2026-12-05", accountId: "nu", deltaCents: 700_000 }, // salário
        { date: "2026-12-10", accountId: "nu", deltaCents: -142_623 }, // fatura do cartão ligado
        { date: "2027-01-10", accountId: "nu", deltaCents: -48_000 }, // parcela na fatura de janeiro
        { date: "2026-11-30", accountId: "itau", deltaCents: -20_000 },
      ],
    });
    expect(p.map((m) => m.month)).toEqual(["2026-11", "2026-12", "2027-01"]);
    expect(p[0]?.accounts).toEqual({ nu: 100_000, itau: 30_000 });
    expect(p[1]?.accounts.nu).toBe(100_000 + 700_000 - 142_623);
    expect(p[2]?.accounts.nu).toBe(100_000 + 700_000 - 142_623 - 48_000);
    expect(p[2]?.totalCents).toBe((p[2]?.accounts.nu ?? 0) + 30_000);
  });

  it("evento atrasado conta no mês atual", () => {
    const [m] = projectBalances({
      today,
      months: 1,
      balances: { nu: 10_000 },
      events: [{ date: "2026-11-10", accountId: "nu", deltaCents: -3_000 }],
    });
    expect(m?.accounts.nu).toBe(7_000);
  });

  it("fatura sem conta ligada entra só no total; conta desconhecida é ignorada", () => {
    const [m] = projectBalances({
      today,
      months: 1,
      balances: { nu: 10_000 },
      events: [
        { date: "2026-11-28", accountId: null, deltaCents: -4_000 },
        { date: "2026-11-28", accountId: "arquivada", deltaCents: -99_999 },
      ],
    });
    expect(m).toMatchObject({ totalCents: 6_000, unassignedCents: -4_000, accounts: { nu: 10_000 } });
  });

  it("acha o primeiro mês negativo", () => {
    const p = projectBalances({
      today,
      months: 3,
      balances: { nu: 1_000 },
      events: [{ date: "2027-01-05", accountId: "nu", deltaCents: -5_000 }],
    });
    expect(firstNegative(p)).toEqual({ month: "2027-01", accountId: "nu" });
    expect(firstNegative(p.slice(0, 2))).toBeNull();
  });
});
