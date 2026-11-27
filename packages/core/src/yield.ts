import { daysInMonth, type ISODate, type YearMonth } from "./dates";
import type { Cents } from "./money";

/*
 * Rendimento de caixinha pelo CDI.
 * Convenção dos bancos (D+1): o dinheiro que entra num dia começa a render no dia útil seguinte.
 * Cada dia útil (dia com taxa CDI publicada) rende saldo × CDI do dia × (% do CDI), composto
 * dia a dia. O valor é calculado em ponto flutuante e só o total do mês vira centavos inteiros.
 */

/** % do CDI guardado como inteiro: 10000 = 100% do CDI, 11000 = 110%. */
export type CdiPercent = number;

export function monthYield(args: {
  month: YearMonth;
  /** Saldo no começo do mês (antes do dia 1). */
  openingCents: Cents;
  /** Entradas e saídas da caixinha no mês. */
  changes: { date: ISODate; deltaCents: Cents }[];
  /** CDI do dia em % ao dia (ex.: 0.0551). Dias sem taxa = sem rendimento (fim de semana, feriado). */
  rates: Record<ISODate, number>;
  cdiPercent: CdiPercent;
  /** Calcular só até este dia (rendimento parcial do mês atual). */
  until?: ISODate;
}): Cents {
  const y = Number(args.month.slice(0, 4));
  const m = Number(args.month.slice(5, 7));
  const last = daysInMonth(y, m);
  const factor = args.cdiPercent / 10000;
  const byDay = new Map<ISODate, number>();
  for (const c of args.changes) {
    if (c.date.slice(0, 7) !== args.month) continue;
    byDay.set(c.date, (byDay.get(c.date) ?? 0) + c.deltaCents);
  }
  let balance = args.openingCents;
  let earned = 0;
  for (let d = 1; d <= last; d++) {
    const date = `${args.month}-${String(d).padStart(2, "0")}`;
    if (args.until && date > args.until) break;
    const rate = args.rates[date];
    // rende sobre o saldo do fim do dia anterior (o que entrou hoje rende a partir de amanhã)
    if (rate !== undefined && balance > 0) {
      const interest = balance * (rate / 100) * factor;
      earned += interest;
      balance += interest;
    }
    balance += byDay.get(date) ?? 0;
  }
  return Math.round(earned);
}

/** Taxa ao ano equivalente a uma taxa diária (252 dias úteis), em %. */
export function annualFromDaily(dailyPercent: number): number {
  return ((1 + dailyPercent / 100) ** 252 - 1) * 100;
}

/** Quanto um saldo rende por mês, em média, numa taxa anual (para estimativas e projeções). */
export function monthlyYieldEstimate(
  balanceCents: Cents,
  annualPercent: number,
  cdiPercent: CdiPercent,
): Cents {
  const monthly = (1 + (annualPercent / 100) * (cdiPercent / 10000)) ** (1 / 12) - 1;
  return Math.round(Math.max(0, balanceCents) * monthly);
}
