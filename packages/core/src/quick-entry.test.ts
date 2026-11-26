import { describe, expect, it } from "vitest";
import { parseQuickEntry, type QuickContext, resolveQuickEntry } from "./quick-entry";

const today = "2026-11-26";

describe("linha mágica: parse", () => {
  it.each([
    ["45 ifood", 4500, ["ifood"]],
    ["ifood 45,90", 4590, ["ifood"]],
    ["r$ 12,50 padaria", 1250, ["padaria"]],
    ["R$12 café", 1200, ["café"]],
    ["1.234,56 aluguel", 123456, ["aluguel"]],
    ["12.5 pão", 1250, ["pão"]],
    ["uber", null, ["uber"]],
  ] as const)("%s", (text, cents, words) => {
    const p = parseQuickEntry(text, today);
    expect(p.amountCents).toBe(cents);
    expect(p.words).toEqual(words);
  });

  it("entende receita, datas e parcelas", () => {
    expect(parseQuickEntry("+3000 salário", today)).toMatchObject({ amountCents: 300000, income: true });
    expect(parseQuickEntry("+ 50 venda", today)).toMatchObject({ amountCents: 5000, income: true });
    expect(parseQuickEntry("30 mercado ontem", today).date).toBe("2026-11-25");
    expect(parseQuickEntry("30 mercado anteontem", today).date).toBe("2026-11-24");
    expect(parseQuickEntry("30 mercado 03/11", today).date).toBe("2026-11-03");
    expect(parseQuickEntry("30 mercado 31/02", today).words).toContain("31/02"); // data inválida fica no texto
    expect(parseQuickEntry("notebook 2400 em 10x", today)).toMatchObject({
      amountCents: 240000,
      installments: 10,
      words: ["notebook"],
    });
  });

  it("só o primeiro número é o valor", () => {
    expect(parseQuickEntry("25 uber 99", today)).toMatchObject({ amountCents: 2500, words: ["uber", "99"] });
  });
});

describe("linha mágica: resolver", () => {
  const ctx: QuickContext = {
    accounts: [
      { id: "nu", name: "Nubank", isCard: false },
      { id: "nu-card", name: "Cartão Nubank", isCard: true },
      { id: "itau", name: "Itaú", isCard: false },
    ],
    categories: [
      { id: "mercado", name: "Mercado", kind: "expense" },
      { id: "rest", name: "Restaurantes", kind: "expense" },
      { id: "sal", name: "Salário", kind: "income" },
    ],
    history: [
      { description: "iFood", categoryId: "rest", accountId: "nu-card", kind: "expense", count: 12 },
      { description: "Uber", categoryId: null, accountId: "itau", kind: "expense", count: 3 },
    ],
  };
  const r = (text: string) => resolveQuickEntry(parseQuickEntry(text, today).words, ctx);

  it("aprende categoria e conta pelo histórico", () => {
    expect(r("45 ifood")).toMatchObject({
      description: "iFood",
      categoryId: "rest",
      accountId: "nu-card",
      source: "history",
    });
    expect(r("45 ifo")).toMatchObject({ categoryId: "rest" }); // começo da palavra
  });

  it("conta escrita no texto vence o histórico e sai da descrição", () => {
    expect(r("45 ifood no itau")).toMatchObject({
      description: "iFood",
      accountId: "itau",
      categoryId: "rest",
    });
    expect(r("45 ifood nubank crédito")).toMatchObject({ accountId: "nu-card", description: "iFood" });
    expect(r("45 ifood nubank pix")).toMatchObject({ accountId: "nu" });
  });

  it("categoria escrita no texto vale e fica na descrição", () => {
    expect(r("120 mercado")).toMatchObject({ description: "Mercado", categoryId: "mercado", source: "text" });
    expect(r("+3000 salário")).toMatchObject({ categoryId: "sal", kind: "income" });
  });

  it("não inventa: sem pistas, tudo null", () => {
    expect(r("30 presente")).toMatchObject({ description: "Presente", categoryId: null, accountId: null });
    expect(r("25 uber")).toMatchObject({ categoryId: null, accountId: "itau" });
  });
});
