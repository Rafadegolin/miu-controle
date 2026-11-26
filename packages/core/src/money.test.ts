import { describe, expect, it } from "vitest";
import { formatBRL, parseBRL, splitCents } from "./money";

describe("parseBRL", () => {
  it.each([
    ["1.234,56", 123456],
    ["1234,56", 123456],
    ["1234.56", 123456],
    ["R$ 12", 1200],
    ["-45,90", -4590],
    ["(45,90)", -4590],
    ["0,5", 50],
    ["1.000.000", 100000000],
  ])("%s → %i", (input, expected) => {
    expect(parseBRL(input)).toBe(expected);
  });

  it.each(["", "abc", "1,2,3"])("rejeita %j", (input) => {
    expect(parseBRL(input)).toBeNull();
  });
});

describe("formatBRL", () => {
  it("formata centavos em reais", () => {
    expect(formatBRL(123456)).toBe("R$ 1.234,56");
    expect(formatBRL(-4590)).toBe("-R$ 45,90");
  });
});

describe("splitCents", () => {
  it("joga o centavo do arredondamento na primeira parte", () => {
    expect(splitCents(1000, 3)).toEqual([334, 333, 333]);
    expect(splitCents(480000, 10).every((v) => v === 48000)).toBe(true);
  });

  it("soma sempre o total", () => {
    const parts = splitCents(320001, 6);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(320001);
  });
});
