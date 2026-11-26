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
