import type { Cents } from "./money";

/**
 * Importação de extratos. Roda no navegador (o arquivo nunca sobe inteiro) e é testável aqui.
 * Portado dos parsers do sistema antigo (sem dependências), agora em centavos e com detecção
 * automática de separador e colunas no CSV.
 */

export type ParsedRow = {
  date: string; // YYYY-MM-DD
  /** Com sinal: negativo = saiu da conta, positivo = entrou. */
  amountCents: Cents;
  description: string;
  /** Identificador do banco (OFX). Garante que importar o mesmo arquivo não duplica. */
  fitid?: string;
};

export class ImportError extends Error {}

/* ---------- texto do arquivo ---------- */

/**
 * Muitos bancos brasileiros exportam em Windows-1252 (Latin-1). Tenta UTF-8 primeiro;
 * se o arquivo não for UTF-8 válido, decodifica como Windows-1252 para não estragar acentos.
 */
export function decodeFile(bytes: ArrayBuffer | Uint8Array): string {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(data).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(data);
  }
}

export function parseStatementFile(
  text: string,
  opts: CsvOptions = {},
): { format: "ofx" | "csv"; rows: ParsedRow[] } {
  if (/<STMTTRN>/i.test(text) || /^\s*OFXHEADER/i.test(text)) return { format: "ofx", rows: parseOfx(text) };
  return { format: "csv", rows: parseCsv(text, opts) };
}

/* ---------- OFX ---------- */

/** OFX 1.x é SGML: as tags muitas vezes não fecham. Lê cada campo até o fim da linha ou a próxima tag. */
export function parseOfx(content: string): ParsedRow[] {
  if (!/<STMTTRN>/i.test(content)) {
    throw new ImportError("Arquivo OFX sem lançamentos (<STMTTRN>).");
  }
  const blocks = content
    .split(/<STMTTRN>/i)
    .slice(1)
    .map((b) => b.split(/<\/STMTTRN>/i)[0] ?? "");
  const rows: ParsedRow[] = [];
  for (const block of blocks) {
    const rawAmount = field(block, "TRNAMT");
    const rawDate = field(block, "DTPOSTED");
    if (rawAmount === null || rawDate === null) continue;
    const amountCents = toCents(rawAmount.replace(",", "."));
    if (amountCents === null || amountCents === 0) continue;
    const m = rawDate.match(/^(\d{4})(\d{2})(\d{2})/);
    if (!m) continue;
    const description = (field(block, "MEMO") || field(block, "NAME") || "Lançamento importado").replace(
      /\s+/g,
      " ",
    );
    const fitid = field(block, "FITID");
    rows.push({ date: `${m[1]}-${m[2]}-${m[3]}`, amountCents, description, ...(fitid ? { fitid } : {}) });
  }
  if (rows.length === 0) throw new ImportError("Nenhum lançamento válido no arquivo OFX.");
  return rows;
}

function field(block: string, tag: string): string | null {
  const m = block.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, "i"));
  const v = m?.[1]?.trim();
  return v ? decodeEntities(v) : null;
}

const decodeEntities = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");

/* ---------- CSV ---------- */

export type CsvOptions = {
  /** Detectado automaticamente se omitido (";" ou "," ou tab). */
  delimiter?: string;
  /** Índices das colunas; detectados pelo cabeçalho se omitidos. */
  dateColumn?: number;
  descriptionColumn?: number;
  amountColumn?: number;
};

const HEADER = {
  date: /^(data|date|dt|data lan[cç]amento|data da transa[cç][aã]o|data mov.*)$/i,
  description:
    /^(descri[cç][aã]o|hist[oó]rico|lan[cç]amento|title|t[ií]tulo|description|estabelecimento|memo)$/i,
  amount: /^(valor|amount|value|valor \(r\$\)|valor r\$|quantia)$/i,
};

export function parseCsv(content: string, opts: CsvOptions = {}): ParsedRow[] {
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) throw new ImportError("O arquivo está vazio.");
  const delimiter = opts.delimiter ?? detectDelimiter(lines.slice(0, 5));
  const table = lines.map((l) => splitCsvLine(l, delimiter).map((c) => c.trim()));
  const first = table[0] ?? [];
  const hasHeader = first.some(
    (c) => HEADER.date.test(c) || HEADER.amount.test(c) || HEADER.description.test(c),
  );
  const body = hasHeader ? table.slice(1) : table;

  const cols = {
    date: opts.dateColumn ?? (hasHeader ? first.findIndex((c) => HEADER.date.test(c)) : -1),
    description:
      opts.descriptionColumn ?? (hasHeader ? first.findIndex((c) => HEADER.description.test(c)) : -1),
    amount: opts.amountColumn ?? (hasHeader ? first.findIndex((c) => HEADER.amount.test(c)) : -1),
  };
  // Sem cabeçalho reconhecível: adivinha pelo conteúdo da primeira linha de dados.
  const sample = body[0] ?? [];
  if (cols.date < 0) cols.date = sample.findIndex((c) => parseAnyDate(c) !== null);
  if (cols.amount < 0)
    cols.amount = sample.findIndex((c, i) => i !== cols.date && toCents(normalizeNumber(c)) !== null);
  if (cols.description < 0)
    cols.description = sample.findIndex((_, i) => i !== cols.date && i !== cols.amount);
  if (cols.date < 0 || cols.amount < 0) {
    throw new ImportError(
      "Não encontrei as colunas de data e valor. O CSV precisa ter data; descrição; valor.",
    );
  }

  const rows: ParsedRow[] = [];
  for (const cells of body) {
    const date = parseAnyDate(cells[cols.date] ?? "");
    const amountCents = toCents(normalizeNumber(cells[cols.amount] ?? ""));
    if (!date || amountCents === null || amountCents === 0) continue;
    rows.push({
      date,
      amountCents,
      description: (cells[cols.description] ?? "").replace(/\s+/g, " ") || "Lançamento importado",
    });
  }
  if (rows.length === 0)
    throw new ImportError("Nenhum lançamento válido no CSV. Confira se há data e valor em cada linha.");
  return rows;
}

function detectDelimiter(lines: string[]) {
  const candidates = [";", "\t", ","];
  const score = (d: string) => Math.min(...lines.map((l) => splitCsvLine(l, d).length));
  return candidates.reduce((best, d) => (score(d) > score(best) ? d : best), ";");
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === delimiter && !quoted) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** "1.234,56" / "-1234.56" / "R$ 10,00" / "(10,00)" → "-1234.56" (ponto decimal). */
function normalizeNumber(raw: string): string {
  let s = raw.replace(/R\$|\s|"/g, "");
  const negative = /^\(.*\)$/.test(s) || s.endsWith("-") || s.startsWith("-");
  s = s.replace(/[()]/g, "").replace(/^-|-$/g, "");
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  return negative ? `-${s}` : s;
}

function toCents(numeric: string): Cents | null {
  if (!/^-?\d+(\.\d+)?$/.test(numeric)) return null;
  const negative = numeric.startsWith("-");
  const [int = "0", frac = ""] = numeric.replace("-", "").split(".");
  const cents = Number(int) * 100 + Number(frac.padEnd(2, "0").slice(0, 2));
  return negative ? -cents : cents;
}

/** DD/MM/AAAA, DD-MM-AAAA, DD/MM/AA ou AAAA-MM-DD. */
function parseAnyDate(raw: string): string | null {
  const s = raw.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return valid(`${m[1]}-${m[2]}-${m[3]}`);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (m) {
    const year = m[3]?.length === 2 ? `20${m[3]}` : m[3];
    return valid(`${year}-${m[2]?.padStart(2, "0")}-${m[1]?.padStart(2, "0")}`);
  }
  return null;
}

function valid(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(date) ? date : null;
}

/* ---------- comparação e categorias ---------- */

/** Texto comparável: sem acento, sem pontuação, sem números de autorização/parcelas soltos. */
export function normalizeDescription(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\b\d{2}\/\d{2}\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** "PIX ENVIADO - FULANO" → "Pix enviado - fulano" (extratos vêm em CAIXA ALTA). */
export function prettifyDescription(s: string): string {
  const t = s.trim().replace(/\s+/g, " ");
  if (t !== t.toUpperCase()) return t;
  const lower = t.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** Palavras-chave → nome de categoria padrão. Usado quando o histórico do usuário não ajuda. */
export const CATEGORY_KEYWORDS: [RegExp, string][] = [
  [/mercad|supermerc|atacad|hortifr|padaria|acougue|sacolao|feira/, "Mercado"],
  [/ifood|restaur|lanchon|pizz|burger|bar |cafe|rappi|delivery/, "Restaurantes"],
  [
    /uber|99 ?app|99pop|posto|combust|ipiranga|shell|estacion|metro|onibus|pedagio|sem parar|veloe/,
    "Transporte",
  ],
  [/farmac|drogar|droga|raia|pacheco|consulta|clinica|hospital|laborat|exame|unimed|odonto/, "Saúde"],
  [
    /netflix|spotify|disney|hbo|max\b|prime video|youtube|deezer|apple com|google storage|icloud|assinatura/,
    "Assinaturas",
  ],
  [/cinema|ingresso|show|teatro|steam|playstation|xbox/, "Lazer"],
  [
    /aluguel|condom|energia|enel|cemig|light|copel|sabesp|agua|gas |internet|vivo|claro|tim\b|oi\b/,
    "Moradia",
  ],
  [/escola|faculd|curso|udemy|alura|livrar/, "Educação"],
  [/amazon|mercadolivre|mercado livre|shopee|magalu|americanas|shein|aliexpress|loja/, "Compras"],
  [/salario|pagamento de salario|folha|proventos/, "Salário"],
  [/rendimento|juros|dividendo|resgate/, "Rendimentos"],
];

export function guessCategoryName(description: string, kind: "income" | "expense"): string | null {
  const d = ` ${normalizeDescription(description)} `;
  for (const [re, name] of CATEGORY_KEYWORDS) {
    if (!re.test(d)) continue;
    const isIncome = name === "Salário" || name === "Rendimentos";
    if ((kind === "income") === isIncome) return name;
  }
  return null;
}
