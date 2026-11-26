import { addDays, type ISODate, makeDate, parseDate } from "./dates";

/*
 * Regras de recorrência (salário, aluguel, assinaturas…).
 *
 * Correções em relação ao sistema antigo:
 * - a data de início CONTA como a primeira ocorrência (antes ela era pulada);
 * - dia 31 em mês curto cai no último dia do mês, sem "vazar" para o mês seguinte;
 * - ocorrências atrasadas são recuperadas (catch-up), nunca puladas;
 * - tudo em datas sem fuso, sem Date local.
 */

export type Frequency = "monthly" | "weekly" | "yearly";

export type RecurrenceRule = {
  frequency: Frequency;
  /** A cada N períodos (1 = todo mês/semana/ano). */
  interval: number;
  /** Primeira ocorrência possível (inclusive). Define o dia do mês/semana/ano padrão. */
  startDate: ISODate;
  /** Última data possível (inclusive). */
  endDate?: ISODate | null;
  /** Mensal/anual: dia desejado (1–31, com clamp no fim do mês). Padrão: o dia do startDate. */
  dayOfMonth?: number | null;
};

const monthsBetween = (a: { y: number; m: number }, b: { y: number; m: number }) =>
  (b.y - a.y) * 12 + (b.m - a.m);

/** Todas as ocorrências entre `from` e `to` (inclusive), em ordem. */
export function occurrencesBetween(rule: RecurrenceRule, from: ISODate, to: ISODate): ISODate[] {
  const interval = Math.max(1, Math.floor(rule.interval));
  const last = rule.endDate && rule.endDate < to ? rule.endDate : to;
  const first = rule.startDate > from ? rule.startDate : from;
  if (first > last) return [];
  const start = parseDate(rule.startDate);
  const out: ISODate[] = [];

  if (rule.frequency === "weekly") {
    // ocorrências: startDate + k·7·interval dias
    const step = 7 * interval;
    const daysToFirst = Math.max(0, Math.ceil(daysBetween(rule.startDate, first) / step) * step);
    for (let d = addDays(rule.startDate, daysToFirst); d <= last; d = addDays(d, step)) out.push(d);
    return out;
  }

  const day = rule.dayOfMonth ?? start.d;
  const stepMonths = rule.frequency === "yearly" ? 12 * interval : interval;
  const f = parseDate(first);
  // primeiro índice k cujo mês não é anterior ao mês de `first`
  let k = Math.max(0, Math.ceil(monthsBetween(start, f) / stepMonths));
  for (;;) {
    const date = makeDate(start.y, start.m + k * stepMonths, day);
    if (date > last) break;
    if (date >= first) out.push(date);
    k++;
  }
  return out;
}

/** Próxima ocorrência a partir de `from` (inclusive), ou null se a regra já terminou. */
export function nextOccurrence(rule: RecurrenceRule, from: ISODate): ISODate | null {
  // um ano e um dia cobre qualquer frequência com interval razoável
  const horizon = addDays(from, 366 * Math.max(1, rule.frequency === "yearly" ? rule.interval : 1) + 7);
  return occurrencesBetween(rule, from, horizon)[0] ?? null;
}

function daysBetween(a: ISODate, b: ISODate) {
  const pa = parseDate(a);
  const pb = parseDate(b);
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86_400_000);
}

/** Quanto a regra representa por mês, em média (para "despesas fixas por mês"). */
export function monthlyEquivalent(amountCents: number, frequency: Frequency, interval: number) {
  const perYear =
    frequency === "monthly" ? 12 / interval : frequency === "weekly" ? 52 / interval : 1 / interval;
  return Math.round((amountCents * perYear) / 12);
}
