import { daysInMonth, type ISODate, parseDate, type YearMonth } from "./dates";
import type { Cents } from "./money";

/* ---------- orçamento ---------- */

export type BudgetStatus = "ok" | "warning" | "over";

/** Aviso a partir de 80% do limite; estourado acima de 100%. */
export const BUDGET_WARNING_RATIO = 0.8;

export function budgetStatus(spentCents: Cents, limitCents: Cents): BudgetStatus {
  if (limitCents <= 0) return spentCents > 0 ? "over" : "ok";
  const ratio = spentCents / limitCents;
  if (ratio > 1) return "over";
  if (ratio >= BUDGET_WARNING_RATIO) return "warning";
  return "ok";
}

/**
 * Quanto ainda dá para gastar por dia até o fim do mês (contando hoje).
 * Fora do mês atual não faz sentido: devolve null.
 */
export function dailyAllowance(remainingCents: Cents, month: YearMonth, today: ISODate): Cents | null {
  if (today.slice(0, 7) !== month) return null;
  const { y, m, d } = parseDate(today);
  const daysLeft = daysInMonth(y, m) - d + 1;
  return Math.max(0, Math.floor(remainingCents / daysLeft));
}

/** Arredonda uma sugestão de limite para cima, em múltiplos de R$ 50. */
export function suggestLimit(averageCents: Cents): Cents {
  const step = 5000;
  return Math.max(step, Math.ceil(averageCents / step) * step);
}

/* ---------- metas ---------- */

/** Meses inteiros de `today` até `targetDate` (mínimo 1 se a data ainda não passou). */
export function monthsUntil(today: ISODate, targetDate: ISODate): number {
  const a = parseDate(today);
  const b = parseDate(targetDate);
  const months = (b.y - a.y) * 12 + (b.m - a.m) - (b.d < a.d ? 1 : 0);
  return targetDate < today ? 0 : Math.max(1, months);
}

/**
 * Quanto guardar por mês para chegar no alvo até a data.
 * null quando não tem data; 0 quando já chegou; o que falta inteiro quando a data já passou.
 */
export function monthlyToReach(args: {
  targetCents: Cents;
  savedCents: Cents;
  today: ISODate;
  targetDate: ISODate | null;
}): Cents | null {
  const missing = args.targetCents - args.savedCents;
  if (missing <= 0) return 0;
  if (!args.targetDate) return null;
  const months = monthsUntil(args.today, args.targetDate);
  return months === 0 ? missing : Math.ceil(missing / months);
}
