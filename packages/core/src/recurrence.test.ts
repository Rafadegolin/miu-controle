import { describe, expect, it } from "vitest";
import { monthlyEquivalent, nextOccurrence, occurrencesBetween, type RecurrenceRule } from "./recurrence";

const monthly = (startDate: string, extra: Partial<RecurrenceRule> = {}): RecurrenceRule => ({
  frequency: "monthly",
  interval: 1,
  startDate,
  ...extra,
});

describe("recorrência mensal", () => {
  it("a data de início é a primeira ocorrência", () => {
    expect(occurrencesBetween(monthly("2026-11-05"), "2026-11-01", "2027-01-31")).toEqual([
      "2026-11-05",
      "2026-12-05",
      "2027-01-05",
    ]);
  });

  it("dia 31 cai no último dia dos meses curtos e volta para 31 depois", () => {
    expect(occurrencesBetween(monthly("2026-01-31"), "2026-01-01", "2026-05-31")).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
      "2026-05-31",
    ]);
  });

  it("respeita ano bissexto", () => {
    expect(occurrencesBetween(monthly("2028-01-30"), "2028-02-01", "2028-02-29")).toEqual(["2028-02-29"]);
  });

  it("recupera ocorrências atrasadas (catch-up) sem pular nenhuma", () => {
    expect(occurrencesBetween(monthly("2026-06-10"), "2026-08-01", "2026-11-30")).toEqual([
      "2026-08-10",
      "2026-09-10",
      "2026-10-10",
      "2026-11-10",
    ]);
  });

  it("a cada 2 meses e com data final", () => {
    const r = monthly("2026-01-15", { interval: 2, endDate: "2026-07-14" });
    expect(occurrencesBetween(r, "2026-01-01", "2026-12-31")).toEqual([
      "2026-01-15",
      "2026-03-15",
      "2026-05-15",
    ]);
  });

  it("dia do mês diferente do início", () => {
    const r = monthly("2026-11-20", { dayOfMonth: 5 });
    expect(occurrencesBetween(r, "2026-11-01", "2027-01-31")).toEqual(["2026-12-05", "2027-01-05"]);
  });
});

describe("semanal e anual", () => {
  it("semanal a partir do início", () => {
    const r: RecurrenceRule = { frequency: "weekly", interval: 1, startDate: "2026-11-02" };
    expect(occurrencesBetween(r, "2026-11-10", "2026-11-30")).toEqual([
      "2026-11-16",
      "2026-11-23",
      "2026-11-30",
    ]);
  });

  it("quinzenal", () => {
    const r: RecurrenceRule = { frequency: "weekly", interval: 2, startDate: "2026-11-02" };
    expect(occurrencesBetween(r, "2026-11-01", "2026-12-31")).toEqual([
      "2026-11-02",
      "2026-11-16",
      "2026-11-30",
      "2026-12-14",
      "2026-12-28",
    ]);
  });

  it("anual em 29/fev cai em 28/fev nos anos comuns", () => {
    const r: RecurrenceRule = { frequency: "yearly", interval: 1, startDate: "2028-02-29" };
    expect(occurrencesBetween(r, "2028-01-01", "2030-12-31")).toEqual([
      "2028-02-29",
      "2029-02-28",
      "2030-02-28",
    ]);
  });
});

describe("próxima ocorrência e equivalente mensal", () => {
  it("próxima a partir de hoje, ou null se terminou", () => {
    expect(nextOccurrence(monthly("2026-01-10"), "2026-11-26")).toBe("2026-12-10");
    expect(nextOccurrence(monthly("2026-01-10", { endDate: "2026-11-01" }), "2026-11-26")).toBeNull();
  });

  it("converte para valor por mês", () => {
    expect(monthlyEquivalent(1000, "monthly", 1)).toBe(1000);
    expect(monthlyEquivalent(12000, "yearly", 1)).toBe(1000);
    expect(monthlyEquivalent(1200, "weekly", 1)).toBe(5200);
  });
});
