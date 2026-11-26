import { describe, expect, it } from "vitest";
import {
  decodeFile,
  guessCategoryName,
  normalizeDescription,
  parseCsv,
  parseOfx,
  parseStatementFile,
  prettifyDescription,
} from "./import";

const OFX_SGML = `OFXHEADER:100
DATA:OFXSGML
CHARSET:1252
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261124120000[-3:BRT]
<TRNAMT>-187.35
<FITID>202611240001
<MEMO>SUPERMERCADO CENTRAL
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20261125
<TRNAMT>7800,00
<FITID>202611250002
<NAME>SALARIO EMPRESA &amp; CIA
</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

describe("OFX", () => {
  it("lê OFX 1.x (SGML sem tags fechadas), com FITID e valores em centavos", () => {
    expect(parseOfx(OFX_SGML)).toEqual([
      { date: "2026-11-24", amountCents: -18735, description: "SUPERMERCADO CENTRAL", fitid: "202611240001" },
      {
        date: "2026-11-25",
        amountCents: 780000,
        description: "SALARIO EMPRESA & CIA",
        fitid: "202611250002",
      },
    ]);
  });

  it("detecta o formato sozinho", () => {
    expect(parseStatementFile(OFX_SGML).format).toBe("ofx");
  });
});

describe("CSV", () => {
  it("formato brasileiro: ponto e vírgula, DD/MM/AAAA, vírgula decimal e milhar", () => {
    const csv =
      "Data;Descrição;Valor\n24/11/2026;PADARIA BOM GRÃO;-23,90\n25/11/2026;PIX RECEBIDO;1.500,00\n";
    expect(parseCsv(csv)).toEqual([
      { date: "2026-11-24", amountCents: -2390, description: "PADARIA BOM GRÃO" },
      { date: "2026-11-25", amountCents: 150000, description: "PIX RECEBIDO" },
    ]);
  });

  it("formato de fatura de cartão: vírgula, AAAA-MM-DD, ponto decimal, colunas em outra ordem", () => {
    const csv = 'date,title,amount\n2026-11-20,"Loja, Centro",45.9\n2026-11-21,Uber *Trip,18.4';
    expect(parseCsv(csv)).toEqual([
      { date: "2026-11-20", amountCents: 4590, description: "Loja, Centro" },
      { date: "2026-11-21", amountCents: 1840, description: "Uber *Trip" },
    ]);
  });

  it("sem cabeçalho: adivinha as colunas pelo conteúdo; ignora linhas sem data/valor", () => {
    const csv = "01/11/26;Café;-8,50\nSaldo anterior;;\n02/11/26;Mercado;(120,00)";
    expect(parseCsv(csv).map((r) => [r.date, r.amountCents])).toEqual([
      ["2026-11-01", -850],
      ["2026-11-02", -12000],
    ]);
  });

  it("recusa arquivo sem data ou valor reconhecível", () => {
    expect(() => parseCsv("nome;cidade\nana;sp")).toThrow(/data e valor/);
  });
});

describe("texto", () => {
  it("decodifica Windows-1252 quando não é UTF-8", () => {
    const latin1 = new Uint8Array([0x50, 0x41, 0x44, 0x41, 0x52, 0x49, 0x41, 0x20, 0x47, 0x52, 0xc3, 0x4f]); // "PADARIA GRÃO" em 1252 = 0xC3 'Ã'
    expect(decodeFile(latin1)).toBe("PADARIA GRÃO");
    expect(decodeFile(new TextEncoder().encode("Ação"))).toBe("Ação");
  });

  it("normaliza para comparar e deixa a descrição legível", () => {
    expect(normalizeDescription("Pão de Açúcar  #123 25/11")).toBe("pao de acucar 123");
    expect(prettifyDescription("UBER *TRIP HELP.UBER.COM")).toBe("Uber *trip help.uber.com");
    expect(prettifyDescription("Já está bom")).toBe("Já está bom");
  });

  it("sugere categoria por palavra-chave, respeitando receita x despesa", () => {
    expect(guessCategoryName("IFOOD *RESTAURANTE", "expense")).toBe("Restaurantes");
    expect(guessCategoryName("POSTO IPIRANGA", "expense")).toBe("Transporte");
    expect(guessCategoryName("SALARIO NOVEMBRO", "income")).toBe("Salário");
    expect(guessCategoryName("SALARIO NOVEMBRO", "expense")).toBeNull();
    expect(guessCategoryName("XYZ 123", "expense")).toBeNull();
  });
});
