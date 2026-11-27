import { daysInMonth, type ISODate, type YearMonth } from "./dates";
import type { Cents } from "./money";

/*
 * Ritmo de gastos: compara o gasto acumulado do mês com o do mês passado até o mesmo dia.
 */

export type PaceStatus = "below" | "near" | "above";

/** Até 5% de diferença conta como "no mesmo ritmo". */
export const PACE_TOLERANCE = 0.05;

/**
 * Gasto acumulado dia a dia no mês. `upToDay` corta a série (mês atual: até hoje).
 * Lançamentos fora do mês são ignorados.
 */
export function cumulativeByDay(
  entries: { date: ISODate; amountCents: Cents }[],
  month: YearMonth,
  upToDay?: number,
): Cents[] {
  const total = daysInMonth(Number(month.slice(0, 4)), Number(month.slice(5, 7)));
  const length = Math.max(0, Math.min(total, upToDay ?? total));
  const perDay = new Array<number>(total).fill(0);
  for (const e of entries) {
    if (e.date.slice(0, 7) !== month) continue;
    const day = Number(e.date.slice(8, 10));
    perDay[day - 1] = (perDay[day - 1] ?? 0) + e.amountCents;
  }
  const out: Cents[] = [];
  let acc = 0;
  for (let i = 0; i < length; i++) {
    acc += perDay[i] ?? 0;
    out.push(acc);
  }
  return out;
}

/** Quanto foi gasto até o dia `day` numa série acumulada (mês mais curto: usa o último dia). */
export function valueAtDay(series: Cents[], day: number): Cents {
  if (series.length === 0 || day <= 0) return 0;
  return series[Math.min(day, series.length) - 1] ?? 0;
}

/** Abaixo, no mesmo ritmo ou acima do mês passado até o mesmo dia. */
export function paceStatus(current: Cents, previousSameDay: Cents): PaceStatus {
  if (previousSameDay <= 0) return current > 0 ? "above" : "below";
  const ratio = current / previousSameDay;
  if (ratio < 1 - PACE_TOLERANCE) return "below";
  if (ratio <= 1 + PACE_TOLERANCE) return "near";
  return "above";
}

/**
 * Quanto o mês deve fechar de gastos, se o ritmo continuar.
 * = gasto até hoje + previstos que faltam (contas fixas, parcelas) + gasto variável diário × dias restantes.
 * O ritmo diário mistura o mês atual com a média histórica: no começo do mês vale mais o histórico
 * (poucos dias não dizem muito); perto do fim, o ritmo atual.
 */
export function projectMonthSpend(args: {
  spentCents: Cents;
  /** Parte variável do gasto até hoje (sem recorrências e parcelas). */
  variableSpentCents: Cents;
  plannedRemainingCents: Cents;
  day: number;
  daysInMonth: number;
  /** Gasto variável médio por dia nos meses anteriores (0 se não houver histórico). */
  historyDailyCents: number;
}): Cents {
  const daysLeft = Math.max(0, args.daysInMonth - args.day);
  const currentDaily = args.day > 0 ? args.variableSpentCents / args.day : 0;
  const weight = args.daysInMonth > 0 ? args.day / args.daysInMonth : 1;
  const daily =
    args.historyDailyCents > 0 ? weight * currentDaily + (1 - weight) * args.historyDailyCents : currentDaily;
  return args.spentCents + args.plannedRemainingCents + Math.round(daily * daysLeft);
}
