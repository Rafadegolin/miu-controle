import { z } from "zod";
import type { StatementSummary, Transaction } from "./finance";

export type UpcomingItem =
  | { type: "transaction"; date: string; transaction: Transaction }
  | { type: "statement"; date: string; accountId: string; statement: StatementSummary };

export type Dashboard = {
  today: string;
  month: string;
  /** Soma das contas (sem cartões), só com o realizado. */
  bankBalanceCents: number;
  /**
   * Saldo previsto no fim do mês: contas + receitas previstas − despesas previstas (nas contas,
   * incluindo previstos atrasados) − faturas que vencem até o fim do mês.
   */
  projectedEndCents: number;
  /** Quanto das faturas entrou na conta acima. */
  cardsDueThisMonthCents: number;
  totals: {
    incomePostedCents: number;
    incomePlannedCents: number;
    expensePostedCents: number;
    expensePlannedCents: number;
  };
  /** Mês anterior (realizado + previsto), para comparar. */
  previousTotals: { incomeCents: number; expenseCents: number };
  topCategories: { categoryId: string | null; totalCents: number }[];
  /** Meta ativa mais perto de concluir. */
  goalHighlight: {
    id: string;
    name: string;
    color: string;
    savedCents: number;
    targetCents: number;
    targetDate: string | null;
  } | null;
  /** Fatura que pede atenção em cada cartão. */
  cards: { accountId: string; statement: StatementSummary; availableCents: number }[];
  /** Próximos 15 dias (e previstos atrasados): contas a pagar/receber e vencimentos de fatura. */
  upcoming: UpcomingItem[];
  recent: Transaction[];
};

/* ---------- relatórios ---------- */

export const cashflowQuery = z.object({
  end: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  months: z.coerce.number().int().min(3).max(24).default(12),
});

export type CashflowMonth = {
  month: string;
  incomeCents: number;
  expenseCents: number;
  /** Quanto do total ainda é previsão (meses atuais/futuros). */
  plannedIncomeCents: number;
  plannedExpenseCents: number;
};

export type CategoryReport = {
  month: string;
  totalExpenseCents: number;
  rows: { categoryId: string | null; totalCents: number; averageCents: number }[];
};

/* ---------- ritmo de gastos ---------- */

export type PaceStatus = "below" | "near" | "above";

export type Pace = {
  month: string;
  /** Mês atual? (a série corta em "hoje"). */
  isCurrentMonth: boolean;
  daysInMonth: number;
  /** Dia de referência: hoje no mês atual, o último dia nos outros. */
  day: number;
  daysLeft: number;
  /** Gasto acumulado dia a dia (só realizado), até `day`. */
  current: number[];
  /** Mês anterior inteiro, acumulado (tracejado). */
  previous: number[];
  spentCents: number;
  /** Ainda previsto para o mês (recorrências, compras futuras). */
  plannedCents: number;
  previousToDateCents: number;
  previousTotalCents: number;
  /** Gasto − mês passado até o mesmo dia (negativo = gastando menos). */
  differenceCents: number;
  status: PaceStatus;
  limitCents: number | null;
  remainingCents: number | null;
  dailyAllowanceCents: number | null;
  /** Média de gastos dos 3 meses anteriores (sugestão de limite). */
  averageCents: number;
};
