import { describe, expect, it } from "vitest";
import { detectInstallment, importedInstallments, looksLikeCardPayment } from "./import";

describe("parcelas no extrato do cartão", () => {
  it.each([
    ["NOTEBOOK DELL - PARC 03/10", { no: 3, total: 10, base: "NOTEBOOK DELL", explicit: true }],
    ["Geladeira - Parcela 2/6", { no: 2, total: 6, base: "Geladeira", explicit: true }],
    ["Curso online parcela 4 de 12", { no: 4, total: 12, base: "Curso online", explicit: true }],
    ["MAGAZINE LUIZA (05/12)", { no: 5, total: 12, base: "MAGAZINE LUIZA", explicit: true }],
    ["LOJAS RENNER 02/05", { no: 2, total: 5, base: "LOJAS RENNER", explicit: false }],
  ] as const)("%s", (desc, expected) => {
    expect(detectInstallment(desc)).toEqual(expected);
  });

  it("ignora o que não é parcela", () => {
    expect(detectInstallment("IFOOD *RESTAURANTE")).toBeNull();
    expect(detectInstallment("UBER 25/11")).toBeNull(); // 25 de 11 não existe
    expect(detectInstallment("PARC 01/60")).toBeNull(); // mais de 48
    expect(detectInstallment("Plano 3/1")).toBeNull();
  });
});

describe("pagamento de fatura no extrato da conta", () => {
  it.each([
    ["Pagamento de fatura", true],
    ["PAGAMENTO FATURA CARTAO NUBANK", true],
    ["Pgto cartão Itaú", true],
    ["Nu Pagamento", true],
    ["Fatura paga", true],
    ["PIX ENVIADO JOAO", false],
    ["Pagamento boleto condominio", false],
    ["Compra cartão débito mercado", false],
  ] as const)("%s → %s", (desc, expected) => {
    expect(looksLikeCardPayment(desc)).toBe(expected);
  });
});

describe("parcelas importadas: faturas e datas", () => {
  it("data da própria parcela: as próximas seguem mês a mês", () => {
    const p = importedInstallments({
      rowDate: "2026-11-20",
      no: 3,
      total: 5,
      statementMonth: "2026-12",
      closingDay: 5,
    });
    expect(p).toEqual([
      { no: 3, date: "2026-11-20", statementMonth: "2026-12" },
      { no: 4, date: "2026-12-20", statementMonth: "2027-01" },
      { no: 5, date: "2027-01-20", statementMonth: "2027-02" },
    ]);
  });

  it("data da compra original (meses antes): parcela k = compra + (k−1) meses", () => {
    const p = importedInstallments({
      rowDate: "2026-09-10",
      no: 3,
      total: 4,
      statementMonth: "2026-12",
      closingDay: 5,
    });
    expect(p).toEqual([
      { no: 3, date: "2026-11-10", statementMonth: "2026-12" },
      { no: 4, date: "2026-12-10", statementMonth: "2027-01" },
    ]);
  });
});
