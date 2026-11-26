import { describe, expect, it } from "vitest";
import { cumulativeByDay, paceStatus, valueAtDay } from "./insights";

describe("ritmo de gastos", () => {
  const entries = [
    { date: "2026-11-01", amountCents: 1000 },
    { date: "2026-11-01", amountCents: 500 },
    { date: "2026-11-03", amountCents: 2000 },
    { date: "2026-10-31", amountCents: 99999 }, // outro mês: ignorado
  ];

  it("acumula dia a dia e corta até o dia pedido", () => {
    expect(cumulativeByDay(entries, "2026-11", 4)).toEqual([1500, 1500, 3500, 3500]);
    expect(cumulativeByDay(entries, "2026-11")).toHaveLength(30);
    expect(cumulativeByDay([], "2026-02")).toHaveLength(28);
  });

  it("lê o valor no mesmo dia, mesmo com o mês passado mais curto", () => {
    const fev = cumulativeByDay([{ date: "2026-02-28", amountCents: 700 }], "2026-02");
    expect(valueAtDay(fev, 31)).toBe(700);
    expect(valueAtDay(fev, 0)).toBe(0);
  });

  it.each([
    [900, 1000, "below"],
    [960, 1000, "near"],
    [1050, 1000, "near"],
    [1100, 1000, "above"],
    [0, 0, "below"],
    [10, 0, "above"],
  ] as const)("gasto %i vs %i no mês passado → %s", (cur, prev, expected) => {
    expect(paceStatus(cur, prev)).toBe(expected);
  });
});
