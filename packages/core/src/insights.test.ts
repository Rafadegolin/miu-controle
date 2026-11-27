import { describe, expect, it } from "vitest";
import { cumulativeByDay, paceStatus, projectMonthSpend, valueAtDay } from "./insights";

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

describe("projeção do mês pelo ritmo", () => {
  const base = { spentCents: 0, variableSpentCents: 0, plannedRemainingCents: 0, daysInMonth: 30 };

  it("no começo do mês usa mais o histórico", () => {
    // dia 3, gastou R$ 300 variáveis (R$ 100/dia) mas a média é R$ 50/dia
    const v = projectMonthSpend({
      ...base,
      spentCents: 30_000,
      variableSpentCents: 30_000,
      day: 3,
      historyDailyCents: 5_000,
    });
    // ritmo = 0,1·100 + 0,9·50 = 55/dia × 27 dias
    expect(v).toBe(30_000 + Math.round(5_500 * 27));
  });

  it("no fim do mês usa o ritmo atual", () => {
    const v = projectMonthSpend({
      ...base,
      spentCents: 290_000,
      variableSpentCents: 290_000,
      day: 29,
      historyDailyCents: 1_000,
    });
    expect(v).toBeGreaterThan(299_000);
    expect(v).toBeLessThan(300_100);
  });

  it("fixos (recorrências e parcelas) entram como previstos, não pelo ritmo", () => {
    const v = projectMonthSpend({
      ...base,
      spentCents: 250_000, // inclui R$ 2.100 de aluguel
      variableSpentCents: 40_000,
      plannedRemainingCents: 12_000,
      day: 10,
      historyDailyCents: 0,
    });
    expect(v).toBe(250_000 + 12_000 + 4_000 * 20);
  });
});
