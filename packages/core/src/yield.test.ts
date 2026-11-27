import { describe, expect, it } from "vitest";
import { annualFromDaily, monthlyYieldEstimate, monthYield } from "./yield";

/** Dias úteis de novembro/2026 com CDI 0,05% ao dia (seg–sex). */
const rates: Record<string, number> = {};
for (let d = 1; d <= 30; d++) {
  const date = `2026-11-${String(d).padStart(2, "0")}`;
  const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
  if (dow !== 0 && dow !== 6) rates[date] = 0.05;
}
const businessDays = Object.keys(rates).length;

describe("rendimento da caixinha", () => {
  it("100% do CDI, juros compostos só nos dias úteis", () => {
    const y = monthYield({
      month: "2026-11",
      openingCents: 1_000_000,
      changes: [],
      rates,
      cdiPercent: 10000,
    });
    expect(y).toBe(Math.round(1_000_000 * (1.0005 ** businessDays - 1)));
  });

  it("110% do CDI rende mais", () => {
    const a = monthYield({
      month: "2026-11",
      openingCents: 1_000_000,
      changes: [],
      rates,
      cdiPercent: 10000,
    });
    const b = monthYield({
      month: "2026-11",
      openingCents: 1_000_000,
      changes: [],
      rates,
      cdiPercent: 11000,
    });
    expect(b).toBeGreaterThan(a);
    expect(b).toBe(Math.round(1_000_000 * ((1 + 0.0005 * 1.1) ** businessDays - 1)));
  });

  it("o que entra num dia rende a partir do dia útil seguinte (D+1)", () => {
    // guarda R$ 10.000 na sexta, 27/11: rende só na segunda 30/11
    const y = monthYield({
      month: "2026-11",
      openingCents: 0,
      changes: [{ date: "2026-11-27", deltaCents: 1_000_000 }],
      rates,
      cdiPercent: 10000,
    });
    expect(y).toBe(500);
  });

  it("resgate para de render; rendimento parcial até um dia", () => {
    const y = monthYield({
      month: "2026-11",
      openingCents: 1_000_000,
      changes: [{ date: "2026-11-02", deltaCents: -1_000_500 }], // resgata tudo, com o rendimento do dia
      rates,
      cdiPercent: 10000,
    });
    expect(y).toBe(500); // só a segunda, 02/11 (o saldo do fim do dia 01)
    const parcial = monthYield({
      month: "2026-11",
      openingCents: 1_000_000,
      changes: [],
      rates,
      cdiPercent: 10000,
      until: "2026-11-03",
    });
    expect(parcial).toBe(Math.round(1_000_000 * (1.0005 ** 2 - 1)));
  });

  it("taxa anual e estimativa mensal", () => {
    expect(annualFromDaily(0.0551)).toBeCloseTo(14.89, 1);
    expect(monthlyYieldEstimate(1_000_000, 12, 10000)).toBe(Math.round(1_000_000 * (1.12 ** (1 / 12) - 1)));
    expect(monthlyYieldEstimate(-500, 12, 10000)).toBe(0);
  });
});
