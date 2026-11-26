import { describe, expect, it } from "vitest";
import { addDays, addMonths, addYearMonth, makeDate, todayIn } from "./dates";

describe("datas", () => {
  it("limita o dia ao fim do mês", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(makeDate(2026, 4, 31)).toBe("2026-04-30");
  });

  it("vira o ano", () => {
    expect(addMonths("2026-11-15", 3)).toBe("2027-02-15");
    expect(addYearMonth("2026-12", 1)).toBe("2027-01");
    expect(addYearMonth("2027-01", -1)).toBe("2026-12");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("calcula hoje no fuso de São Paulo", () => {
    // 02:30 UTC do dia 27 ainda é dia 26 em Brasília (UTC-3)
    expect(todayIn("America/Sao_Paulo", new Date("2026-11-27T02:30:00Z"))).toBe("2026-11-26");
  });
});
