import { describe, expect, it } from "vitest";
import { planInstallments } from "./installments";
import { statementDates, statementMonthFor, statementStatus } from "./statement";

describe("em qual fatura cai a compra", () => {
  it("antes do fechamento: fatura do mês; no dia do fechamento ou depois: a seguinte", () => {
    expect(statementMonthFor("2026-11-02", 3)).toBe("2026-11");
    expect(statementMonthFor("2026-11-03", 3)).toBe("2026-12");
    expect(statementMonthFor("2026-11-26", 3)).toBe("2026-12");
    expect(statementMonthFor("2026-12-26", 25)).toBe("2027-01");
  });
});

describe("datas da fatura", () => {
  it("vencimento depois do fechamento fica no mesmo mês", () => {
    expect(statementDates("2026-12", 3, 10)).toEqual({ closeDate: "2026-12-03", dueDate: "2026-12-10" });
  });
  it("vencimento antes do fechamento vai para o mês seguinte (e vira o ano)", () => {
    expect(statementDates("2026-12", 25, 5)).toEqual({ closeDate: "2026-12-25", dueDate: "2027-01-05" });
  });
});

describe("situação da fatura", () => {
  const d = { closeDate: "2026-12-03", dueDate: "2026-12-10" };
  it.each([
    ["2026-12-02", 100, "open"],
    ["2026-12-03", 100, "closed"],
    ["2026-12-10", 100, "closed"],
    ["2026-12-11", 100, "overdue"],
    ["2026-12-05", 0, "paid"],
    ["2026-12-20", 0, "paid"],
  ] as const)("em %s faltando %i → %s", (today, remainingCents, expected) => {
    expect(statementStatus({ today, remainingCents, ...d })).toBe(expected);
  });
});

describe("parcelamento", () => {
  it("10x de 4.800 cai em 10 faturas seguidas, a partir da fatura da compra", () => {
    const p = planInstallments({ totalCents: 480000, count: 10, purchaseDate: "2026-08-14", closingDay: 3 });
    expect(p).toHaveLength(10);
    expect(p[0]).toMatchObject({ no: 1, total: 10, amountCents: 48000, statementMonth: "2026-09" });
    expect(p[9]).toMatchObject({ no: 10, statementMonth: "2027-06", date: "2027-05-14" });
  });

  it("o centavo que sobra vai na primeira parcela e a soma fecha", () => {
    const p = planInstallments({ totalCents: 10000, count: 3, purchaseDate: "2026-01-31", closingDay: 28 });
    expect(p.map((x) => x.amountCents)).toEqual([3334, 3333, 3333]);
    expect(p.reduce((s, x) => s + x.amountCents, 0)).toBe(10000);
    expect(p.map((x) => x.date)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
  });
});
