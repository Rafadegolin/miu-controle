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
  /** Mês atual: quanto deve fechar de gastos se o ritmo continuar. Meses passados: o total. */
  projectedMonthCents: number;
};

/* ---------- projeção das contas ---------- */

export type ProjectedMonth = {
  month: string;
  /** Soma das contas + faturas de cartões sem conta ligada. */
  totalCents: number;
  /** Saldo previsto no fim do mês, por conta (só contas, sem cartões). */
  accounts: Record<string, number>;
  /** Faturas de cartões sem conta ligada, acumuladas (negativo). */
  unassignedCents: number;
};

export type Projection = {
  today: string;
  months: ProjectedMonth[];
  /** Primeiro mês em que uma conta (ou o total, se accountId = null) fica negativa. */
  firstNegative: { month: string; accountId: string | null } | null;
  /** Cartões sem conta de pagamento ligada (a fatura entra só no total). */
  cardsWithoutPayer: string[];
  /** Faturas que vencem em cada mês (todas as contas), em centavos. */
  billsByMonth: Record<string, number>;
};

/**
 * Entrada do Futuro: o que é certo (projeção) + médias. A conta (projectFuture do @miu/core) roda no
 * aparelho, para a simulação responder na hora.
 */
export type Future = {
  today: string;
  months: { month: string; knownTotalCents: number; billsCents: number }[];
  firstNegative: { month: string; accountId: string | null } | null;
  /** Gasto variável médio por mês (sem recorrências e parcelas), últimos 3 meses fechados. */
  variableMonthlyCents: number;
  /** Quanto ainda deve sair de gasto variável no mês atual, pelo ritmo. */
  currentMonthVariableLeftCents: number;
  categories: {
    id: string;
    name: string;
    color: string;
    icon: string;
    averageCents: number;
    lastMonthCents: number;
  }[];
  goals: {
    id: string;
    name: string;
    color: string;
    targetCents: number;
    savedCents: number;
    recentMonthlyCents: number;
    /** Conta-caixinha da meta (para aplicar "guardar todo mês"). */
    accountId: string | null;
    cdiPercent: number | null;
  }[];
  boxes: { accountId: string; balanceCents: number; cdiPercent: number }[];
  cdiAnnualPercent: number | null;
};
