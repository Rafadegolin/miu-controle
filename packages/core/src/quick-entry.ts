import { addDays, type ISODate } from "./dates";
import { type Cents, parseBRL } from "./money";

/*
 * Linha mágica: "45 ifood", "+3000 salário", "120,50 mercado nubank ontem", "notebook 2400 em 10x".
 * Duas etapas puras: `parseQuickEntry` tira valor, data, parcelas e sinal do texto;
 * `resolveQuickEntry` casa o resto com contas, categorias e o histórico do usuário.
 */

export type QuickKind = "expense" | "income";

export type ParsedQuickEntry = {
  amountCents: Cents | null;
  /** "+" na frente do valor: receita. */
  income: boolean;
  date: ISODate;
  installments: number | null;
  /** Palavras que sobraram (descrição, conta, categoria), na grafia original. */
  words: string[];
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const MONEY = /^([+-])?(?:r\$)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)(?:reais|r\$)?$/i;

export function parseQuickEntry(text: string, today: ISODate): ParsedQuickEntry {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  let amountCents: Cents | null = null;
  let income = false;
  let date = today;
  let installments: number | null = null;
  const words: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const raw = tokens[i] ?? "";
    const t = raw.toLowerCase();
    if (t === "hoje") continue;
    if (t === "ontem") {
      date = addDays(today, -1);
      continue;
    }
    if (t === "anteontem") {
      date = addDays(today, -2);
      continue;
    }
    const dm = t.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/);
    if (dm) {
      const d = Number(dm[1]);
      const m = Number(dm[2]);
      const y = dm[3]
        ? dm[3].length === 2
          ? 2000 + Number(dm[3])
          : Number(dm[3])
        : Number(today.slice(0, 4));
      const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const check = new Date(`${iso}T00:00:00Z`);
      if (m >= 1 && m <= 12 && d >= 1 && check.getUTCDate() === d) {
        date = iso;
        continue;
      }
    }
    const parc = t.match(/^(\d{1,2})x$/);
    if (parc) {
      const n = Number(parc[1]);
      if (n >= 2 && n <= 48) {
        installments = n;
        if (words.at(-1)?.toLowerCase() === "em") words.pop();
        continue;
      }
    }
    if (t === "+" && amountCents === null) {
      income = true;
      continue;
    }
    if ((t === "r$" || t === "reais") && amountCents === null) continue;
    if (amountCents === null) {
      const m = raw.match(MONEY);
      if (m) {
        const cents = parseBRL(m[2] ?? "");
        if (cents !== null && cents > 0) {
          amountCents = cents;
          if (m[1] === "+") income = true;
          continue;
        }
      }
    }
    words.push(raw);
  }
  return { amountCents, income, date, installments, words };
}

export type QuickContext = {
  accounts: { id: string; name: string; isCard: boolean }[];
  categories: { id: string; name: string; kind: QuickKind }[];
  /** Descrições já usadas pelo usuário (mais usadas primeiro). */
  history: {
    description: string;
    categoryId: string | null;
    accountId: string;
    kind: QuickKind;
    count: number;
  }[];
};

export type ResolvedQuickEntry = {
  description: string;
  kind: QuickKind | null;
  categoryId: string | null;
  accountId: string | null;
  /** De onde veio a categoria: escrita no texto ou aprendida do histórico. */
  source: "text" | "history" | null;
};

const CARD_WORDS = new Set(["credito", "cartao", "card"]);
const BANK_WORDS = new Set(["debito", "pix", "conta", "dinheiro", "boleto"]);
const CONNECTORS = new Set(["no", "na", "pelo", "pela", "com", "via", "do", "da"]);
const STOP = new Set(["de", "do", "da", "o", "a", "e", "cartao", "conta", "banco"]);

/** Casa as palavras com contas, categorias e o histórico. Não inventa nada: o que não achar fica null. */
export function resolveQuickEntry(words: string[], ctx: QuickContext): ResolvedQuickEntry {
  const keep = words.map(() => true);
  const n = words.map(norm);

  // Meio de pagamento escrito ("crédito", "pix") só desempata contas; sai da descrição.
  let wantCard: boolean | null = null;
  n.forEach((w, i) => {
    if (CARD_WORDS.has(w)) wantCard = true;
    else if (BANK_WORDS.has(w)) wantCard = false;
    else return;
    keep[i] = false;
  });

  // Conta: palavra igual ao nome ou a uma palavra distintiva do nome ("nubank" em "Cartão Nubank").
  let accountId: string | null = null;
  for (let i = 0; i < n.length && !accountId; i++) {
    const w = n[i] ?? "";
    if (w.length < 2) continue;
    const matches = ctx.accounts.filter((a) => {
      const name = norm(a.name);
      return name === w || (w.length >= 3 && name.split(" ").some((p) => p === w && !STOP.has(p)));
    });
    if (matches.length === 0) continue;
    const pick = wantCard === null ? matches[0] : (matches.find((a) => a.isCard === wantCard) ?? matches[0]);
    accountId = pick?.id ?? null;
    keep[i] = false;
    if (i > 0 && CONNECTORS.has(n[i - 1] ?? "")) keep[i - 1] = false;
  }

  const description = words.filter((_, i) => keep[i]).join(" ");
  const key = norm(description);

  // Categoria escrita no texto ("mercado") vale mais que o histórico.
  let categoryId: string | null = null;
  let kind: QuickKind | null = null;
  let source: ResolvedQuickEntry["source"] = null;
  const byName = ctx.categories.find((c) => {
    const name = norm(c.name);
    return (
      key === name ||
      key.split(" ").includes(name) ||
      (name.length >= 4 && key === name.slice(0, key.length) && key.length >= 4)
    );
  });
  if (byName) {
    categoryId = byName.id;
    kind = byName.kind;
    source = "text";
  }

  let pretty = description ? description.charAt(0).toUpperCase() + description.slice(1) : "";
  if (key) {
    const exact = ctx.history.find((h) => norm(h.description) === key);
    if (exact) pretty = exact.description; // mantém a grafia que a pessoa já usa ("iFood")
    const hit =
      ctx.history.find((h) => norm(h.description) === key) ??
      (key.length >= 3
        ? ctx.history.find((h) => {
            const d = norm(h.description);
            return d.startsWith(key) || key.startsWith(d);
          })
        : undefined);
    if (hit) {
      if (!categoryId) {
        categoryId = hit.categoryId;
        kind = hit.kind;
        source = hit.categoryId ? "history" : null;
      }
      if (!accountId) accountId = hit.accountId;
    }
  }

  return { description: pretty, kind, categoryId, accountId, source };
}
