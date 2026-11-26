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
  topCategories: { categoryId: string | null; totalCents: number }[];
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
