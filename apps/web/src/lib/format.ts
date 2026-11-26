import { addDays, formatBRL } from "@miu/core";

export const MONTHS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];
export const MONTHS_SHORT = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];
export const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export const money = formatBRL;

/** "+ R$ 10,00" / "− R$ 10,00" (sinal tipográfico, não hífen). */
export function signedMoney(cents: number, kind: "income" | "expense" | "transfer") {
  if (kind === "income") return `+ ${formatBRL(cents)}`;
  if (kind === "expense") return `− ${formatBRL(cents)}`;
  return formatBRL(cents);
}

export function monthLabel(ym: string) {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  return `${MONTHS[m - 1]} ${y}`;
}

export function monthShort(ym: string) {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  return `${MONTHS_SHORT[m - 1]}/${String(y).slice(2)}`;
}

export function dayShort(date: string) {
  const [, m, d] = date.split("-").map(Number) as [number, number, number];
  return `${d} ${MONTHS_SHORT[m - 1]}`;
}

/** "Hoje", "Ontem", "Amanhã" ou "Quinta, 26 nov". */
export function dayLong(date: string, today: string) {
  if (date === today) return "Hoje";
  if (date === addDays(today, -1)) return "Ontem";
  if (date === addDays(today, 1)) return "Amanhã";
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return `${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}, ${dayShort(date)}`;
}
