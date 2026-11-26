import { addMonths, addYearMonth, type ISODate, type YearMonth } from "./dates";
import { type Cents, splitCents } from "./money";
import { statementMonthFor } from "./statement";

export type Installment = {
  no: number;
  total: number;
  amountCents: Cents;
  date: ISODate;
  statementMonth: YearMonth;
};

/**
 * Divide uma compra parcelada: uma parcela por fatura, a partir da fatura da data da compra.
 * O centavo que sobra da divisão vai na primeira parcela; a soma é sempre o total.
 */
export function planInstallments(args: {
  totalCents: Cents;
  count: number;
  purchaseDate: ISODate;
  closingDay: number;
}): Installment[] {
  const first = statementMonthFor(args.purchaseDate, args.closingDay);
  return splitCents(args.totalCents, args.count).map((amountCents, i) => ({
    no: i + 1,
    total: args.count,
    amountCents,
    date: addMonths(args.purchaseDate, i),
    statementMonth: addYearMonth(first, i),
  }));
}
