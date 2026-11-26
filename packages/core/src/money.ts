/**
 * Dinheiro é sempre inteiro em centavos. Nunca use float para somar valores.
 * No banco: bigint. Na API/JSON: number (seguro até ~90 trilhões de reais).
 */
export type Cents = number;

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function assertCents(value: number): Cents {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`Valor em centavos inválido: ${value}`);
  }
  return value;
}

/** 123456 → "R$ 1.234,56" (espaço normal, não NBSP, para facilitar testes e cópia). */
export function formatBRL(cents: Cents): string {
  return BRL.format(cents / 100).replace(/ /g, " ");
}

/**
 * Converte texto digitado ou vindo de extrato em centavos.
 * Aceita "1.234,56", "1234,56", "1234.56", "R$ 12", "-45,90", "(45,90)".
 * Retorna null quando não há número válido.
 */
export function parseBRL(input: string): Cents | null {
  let s = input.trim().replace(/R\$|\s/g, "");
  if (!s) return null;
  const negative = s.startsWith("-") || /^\(.*\)$/.test(s);
  s = s.replace(/[()+-]/g, "");
  if (s.includes(",")) {
    if ((s.match(/,/g) ?? []).length > 1) return null;
    s = s.replace(/\./g, "").replace(",", ".");
  } else if ((s.match(/\./g) ?? []).length > 1) {
    s = s.replace(/\./g, "");
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const [int = "0", frac = ""] = s.split(".");
  const cents = Number(int) * 100 + Number(frac.padEnd(2, "0").slice(0, 2));
  return negative ? -cents : cents;
}

/** Divide um total em N partes inteiras; o centavo que sobra vai para a primeira. */
export function splitCents(total: Cents, parts: number): Cents[] {
  if (!Number.isInteger(parts) || parts < 1) throw new RangeError("parts deve ser >= 1");
  const per = Math.floor(total / parts);
  return Array.from({ length: parts }, (_, i) => (i === 0 ? total - per * (parts - 1) : per));
}
