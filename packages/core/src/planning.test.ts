import { describe, expect, it } from "vitest";
import { budgetStatus, dailyAllowance, monthlyToReach, monthsUntil, suggestLimit } from "./planning";

describe("orçamento", () => {
  it.each([
    [0, 1000, "ok"],
    [799, 1000, "ok"],
    [800, 1000, "warning"],
    [1000, 1000, "warning"],
    [1001, 1000, "over"],
    [1, 0, "over"],
  ] as const)("gasto %i de %i → %s", (spent, limit, expected) => {
    expect(budgetStatus(spent, limit)).toBe(expected);
  });

  it("divide o que resta pelos dias até o fim do mês, contando hoje", () => {
    expect(dailyAllowance(5000, "2026-11", "2026-11-26")).toBe(1000); // 26..30 = 5 dias
    expect(dailyAllowance(-100, "2026-11", "2026-11-26")).toBe(0);
    expect(dailyAllowance(5000, "2026-12", "2026-11-26")).toBeNull();
  });

  it("sugere limite arredondado para cima em R$ 50", () => {
    expect(suggestLimit(123_45)).toBe(150_00);
    expect(suggestLimit(0)).toBe(50_00);
  });
});

describe("metas", () => {
  it("conta meses inteiros até a data", () => {
    expect(monthsUntil("2026-11-26", "2027-11-26")).toBe(12);
    expect(monthsUntil("2026-11-26", "2027-11-25")).toBe(11);
    expect(monthsUntil("2026-11-26", "2026-12-01")).toBe(1);
    expect(monthsUntil("2026-11-26", "2026-11-01")).toBe(0);
  });

  it("calcula quanto guardar por mês", () => {
    const base = { targetCents: 900_000, savedCents: 240_000, today: "2026-11-26" };
    expect(monthlyToReach({ ...base, targetDate: "2027-07-26" })).toBe(82_500); // 660.000 / 8
    expect(monthlyToReach({ ...base, targetDate: null })).toBeNull();
    expect(monthlyToReach({ ...base, savedCents: 900_000, targetDate: "2027-07-26" })).toBe(0);
    expect(monthlyToReach({ ...base, targetDate: "2026-01-01" })).toBe(660_000);
  });
});
