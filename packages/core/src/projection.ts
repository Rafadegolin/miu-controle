import { addYearMonth, daysInMonth, type ISODate, type YearMonth } from "./dates";
import type { Cents } from "./money";

/*
 * Projeção do saldo das contas, mês a mês.
 * A API transforma o que vai acontecer em eventos (previstos, faturas, recorrências futuras) e esta
 * função só acumula: saldo de hoje + eventos até o fim de cada mês.
 */

export type ProjectionEvent = {
  date: ISODate;
  /** Conta afetada. `null` = fatura de cartão sem conta ligada (entra só no total). */
  accountId: string | null;
  deltaCents: Cents;
};

export type ProjectedMonth = {
  month: YearMonth;
  /** Soma das contas + faturas sem conta ligada. */
  totalCents: Cents;
  accounts: Record<string, Cents>;
  /** Faturas de cartões sem conta ligada, acumuladas (negativo). */
  unassignedCents: Cents;
};

const monthEnd = (m: YearMonth): ISODate =>
  `${m}-${String(daysInMonth(Number(m.slice(0, 4)), Number(m.slice(5, 7)))).padStart(2, "0")}`;

/**
 * `balances`: saldo realizado de hoje de cada conta (só contas, sem cartões).
 * Eventos atrasados (data antes de hoje) contam no mês atual: ainda vão acontecer.
 * Eventos de contas que não estão em `balances` (arquivadas, removidas) são ignorados.
 */
export function projectBalances(args: {
  today: ISODate;
  months: number;
  balances: Record<string, Cents>;
  events: ProjectionEvent[];
}): ProjectedMonth[] {
  const first = args.today.slice(0, 7) as YearMonth;
  const sorted = [...args.events].sort((a, b) => a.date.localeCompare(b.date));
  const running: Record<string, Cents> = { ...args.balances };
  let unassigned = 0;
  let i = 0;
  const out: ProjectedMonth[] = [];
  for (let k = 0; k < Math.max(1, args.months); k++) {
    const m = addYearMonth(first, k);
    const end = monthEnd(m);
    while (i < sorted.length && (sorted[i]?.date ?? "") <= end) {
      const e = sorted[i] as ProjectionEvent;
      i++;
      if (e.accountId === null) unassigned += e.deltaCents;
      else if (e.accountId in running) running[e.accountId] = (running[e.accountId] ?? 0) + e.deltaCents;
    }
    const sum = Object.values(running).reduce((s, v) => s + v, 0);
    out.push({
      month: m,
      totalCents: sum + unassigned,
      accounts: { ...running },
      unassignedCents: unassigned,
    });
  }
  return out;
}

/** Primeiro mês em que alguma conta (ou o total) fica negativa, para avisar com antecedência. */
export function firstNegative(
  months: ProjectedMonth[],
): { month: YearMonth; accountId: string | null } | null {
  for (const m of months) {
    const acc = Object.entries(m.accounts).find(([, v]) => v < 0);
    if (acc) return { month: m.month, accountId: acc[0] };
    if (m.totalCents < 0) return { month: m.month, accountId: null };
  }
  return null;
}
