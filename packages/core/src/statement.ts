import { addYearMonth, type ISODate, makeDate, parseDate, toYearMonth, type YearMonth } from "./dates";

/*
 * Regras de fatura de cartão.
 *
 * A fatura do mês M fecha no dia `closingDay` de M. Compras feitas a partir do dia de fechamento
 * caem na fatura seguinte (o "melhor dia de compra" é o próprio dia de fechamento).
 * O vencimento é no dia `dueDay`: no mesmo mês se vier depois do fechamento, senão no mês seguinte.
 */

export type StatementStatus = "open" | "closed" | "paid" | "overdue";

/** Em qual fatura (YYYY-MM) cai uma compra feita em `date`. */
export function statementMonthFor(date: ISODate, closingDay: number): YearMonth {
  const { d } = parseDate(date);
  return d >= closingDay ? addYearMonth(toYearMonth(date), 1) : toYearMonth(date);
}

/** Datas de fechamento e vencimento da fatura do mês `month`. */
export function statementDates(month: YearMonth, closingDay: number, dueDay: number) {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return {
    closeDate: makeDate(y, m, closingDay),
    dueDate: dueDay > closingDay ? makeDate(y, m, dueDay) : makeDate(y, m + 1, dueDay),
  };
}

/** Situação da fatura em `today`, dado quanto ainda falta pagar. */
export function statementStatus(args: {
  today: ISODate;
  closeDate: ISODate;
  dueDate: ISODate;
  remainingCents: number;
}): StatementStatus {
  if (args.today < args.closeDate) return "open";
  if (args.remainingCents <= 0) return "paid";
  if (args.today > args.dueDate) return "overdue";
  return "closed";
}

/** Fatura aberta agora (a que recebe compras de hoje). */
export const currentStatementMonth = (today: ISODate, closingDay: number) =>
  statementMonthFor(today, closingDay);

/** "2026-12" → "2026-12-01" (como guardamos no banco) e vice-versa. */
export const monthToDate = (month: YearMonth): ISODate => `${month}-01`;
export const dateToMonth = (date: ISODate): YearMonth => date.slice(0, 7);
