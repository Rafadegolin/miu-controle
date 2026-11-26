import { z } from "zod";

/* ---------- valores fechados ---------- */

export const ACCOUNT_KINDS = ["checking", "savings", "cash", "investment", "credit_card"] as const;
export type AccountKind = (typeof ACCOUNT_KINDS)[number];
/** Tipos de conta que dá para criar nesta fase (cartão entra na Fase 3). */
export const BANK_ACCOUNT_KINDS = ["checking", "savings", "cash", "investment"] as const;

export const ACCOUNT_KIND_LABEL: Record<AccountKind, string> = {
  checking: "Conta corrente",
  savings: "Poupança",
  cash: "Dinheiro",
  investment: "Investimento",
  credit_card: "Cartão de crédito",
};

export const TRANSACTION_KINDS = ["income", "expense", "transfer"] as const;
export type TransactionKind = (typeof TRANSACTION_KINDS)[number];
export type TransactionStatus = "posted" | "planned";
export type CategoryKind = "income" | "expense";

/** Ícones permitidos para categorias (nomes do lucide). Lista fechada: o frontend importa só estes. */
export const CATEGORY_ICONS = [
  "house",
  "shopping-cart",
  "utensils",
  "car",
  "heart-pulse",
  "clapperboard",
  "shopping-bag",
  "tv",
  "graduation-cap",
  "briefcase",
  "zap",
  "trending-up",
  "piggy-bank",
  "gift",
  "plane",
  "paw-print",
  "baby",
  "dumbbell",
  "receipt",
  "shirt",
  "fuel",
  "coffee",
  "smartphone",
  "wrench",
  "ellipsis",
] as const;
export type CategoryIcon = (typeof CATEGORY_ICONS)[number];

/** Paleta das contas e categorias: cores que funcionam no claro e no escuro. */
export const PALETTE = [
  "#1fbf8f",
  "#4aa9e8",
  "#6c8cff",
  "#a983ee",
  "#ec6f93",
  "#f0884f",
  "#d8b23c",
  "#4fbf7f",
  "#7f9894",
  "#3a4644",
] as const;

export const DEFAULT_CATEGORIES: { name: string; kind: CategoryKind; icon: CategoryIcon; color: string }[] = [
  { name: "Moradia", kind: "expense", icon: "house", color: "#6c8cff" },
  { name: "Mercado", kind: "expense", icon: "shopping-cart", color: "#1fbf8f" },
  { name: "Restaurantes", kind: "expense", icon: "utensils", color: "#f0884f" },
  { name: "Transporte", kind: "expense", icon: "car", color: "#4aa9e8" },
  { name: "Saúde", kind: "expense", icon: "heart-pulse", color: "#ec6f93" },
  { name: "Lazer", kind: "expense", icon: "clapperboard", color: "#a983ee" },
  { name: "Compras", kind: "expense", icon: "shopping-bag", color: "#d8b23c" },
  { name: "Assinaturas", kind: "expense", icon: "tv", color: "#7f9894" },
  { name: "Educação", kind: "expense", icon: "graduation-cap", color: "#4fbf7f" },
  { name: "Outros gastos", kind: "expense", icon: "ellipsis", color: "#7f9894" },
  { name: "Salário", kind: "income", icon: "briefcase", color: "#1fbf8f" },
  { name: "Freelas", kind: "income", icon: "zap", color: "#4aa9e8" },
  { name: "Rendimentos", kind: "income", icon: "trending-up", color: "#a983ee" },
  { name: "Outras receitas", kind: "income", icon: "ellipsis", color: "#7f9894" },
];

/* ---------- campos reutilizáveis ---------- */

const MAX_CENTS = 1_000_000_000_00; // R$ 1 bilhão
const id = z.string().min(1).max(64);
const name = z.string().trim().min(1, "Dê um nome.").max(60, "Use até 60 caracteres.");
const color = z.string().regex(/^#[0-9a-f]{6}$/i, "Cor inválida.");
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.")
  .refine(
    (s) =>
      !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s),
    "Data inválida.",
  );
export const yearMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mês inválido.");
const positiveCents = z
  .number({ error: "Informe um valor." })
  .int()
  .positive("Informe um valor maior que zero.")
  .max(MAX_CENTS, "Valor alto demais.");

/* ---------- contas ---------- */

const day = z
  .number({ error: "Informe o dia." })
  .int()
  .min(1, "Use um dia entre 1 e 28.")
  .max(28, "Use um dia entre 1 e 28 (todo mês tem esses dias).");
const limitCents = z.number().int().min(0, "O limite não pode ser negativo.").max(MAX_CENTS);

export const createAccountSchema = z.discriminatedUnion("kind", [
  z
    .object({
      name,
      kind: z.enum(BANK_ACCOUNT_KINDS),
      initialBalanceCents: z.number().int().min(-MAX_CENTS).max(MAX_CENTS).default(0),
      color: color.default("#1fbf8f"),
    })
    .strict(),
  z
    .object({
      name,
      kind: z.literal("credit_card"),
      creditLimitCents: limitCents,
      closingDay: day,
      dueDay: day,
      color: color.default("#3a4644"),
    })
    .strict(),
]);
export type CreateAccount = z.input<typeof createAccountSchema>;

export const updateAccountSchema = z
  .object({
    name: name.optional(),
    color: color.optional(),
    initialBalanceCents: z.number().int().min(-MAX_CENTS).max(MAX_CENTS).optional(),
    // só para cartão
    creditLimitCents: limitCents.optional(),
    closingDay: day.optional(),
    dueDay: day.optional(),
  })
  .strict();
export type UpdateAccount = z.infer<typeof updateAccountSchema>;

export type CardInfo = { creditLimitCents: number; closingDay: number; dueDay: number };

export type Account = {
  id: string;
  name: string;
  kind: AccountKind;
  color: string;
  initialBalanceCents: number;
  /**
   * Derivado: saldo inicial + lançamentos realizados.
   * Em cartão é negativo: o quanto você deve (inclui parcelas futuras já compradas).
   */
  balanceCents: number;
  archived: boolean;
  card: CardInfo | null;
};

/* ---------- categorias ---------- */

export const createCategorySchema = z
  .object({
    name,
    kind: z.enum(["income", "expense"]),
    color: color.default("#7f9894"),
    icon: z.enum(CATEGORY_ICONS).default("ellipsis"),
  })
  .strict();
export type CreateCategory = z.input<typeof createCategorySchema>;

export const updateCategorySchema = z
  .object({ name: name.optional(), color: color.optional(), icon: z.enum(CATEGORY_ICONS).optional() })
  .strict();
export type UpdateCategory = z.infer<typeof updateCategorySchema>;

export type Category = {
  id: string;
  name: string;
  kind: CategoryKind;
  color: string;
  icon: CategoryIcon;
  archived: boolean;
};

/* ---------- lançamentos ---------- */

const description = z.string().trim().max(120, "Use até 120 caracteres.").default("");
const notes = z.string().trim().max(500, "Use até 500 caracteres.").nullable().optional();

const incomeOrExpense = z.object({
  kind: z.enum(["income", "expense"]),
  amountCents: positiveCents,
  accountId: id,
  categoryId: id,
  date: isoDate,
  description,
  notes,
  /** "planned" = previsto (não mexe no saldo). Datas futuras viram previsto automaticamente. */
  status: z.enum(["posted", "planned"]).default("posted"),
  /** Só despesa no cartão: divide o valor total em N parcelas, uma por fatura. */
  installments: z.number().int().min(2, "Mínimo de 2 parcelas.").max(48, "Máximo de 48 parcelas.").optional(),
  /** Compra antiga: quantas parcelas já foram pagas (não são criadas). Para cadastrar dívida que já existe. */
  installmentsPaid: z.number().int().min(0).max(47).optional(),
});

const transfer = z.object({
  kind: z.literal("transfer"),
  amountCents: positiveCents,
  accountId: id,
  toAccountId: id,
  date: isoDate,
  description,
  notes,
  status: z.enum(["posted", "planned"]).default("posted"),
  /** Transferência para cartão = pagamento de fatura. Qual fatura (YYYY-MM)? Sem isso, a mais antiga em aberto. */
  statementMonth: yearMonth.optional(),
});

export const createTransactionSchema = z
  .discriminatedUnion("kind", [incomeOrExpense.strict(), transfer.strict()])
  .refine((t) => t.kind !== "transfer" || t.accountId !== t.toAccountId, {
    message: "Escolha contas diferentes.",
    path: ["toAccountId"],
  });
export type CreateTransaction = z.input<typeof createTransactionSchema>;

export const updateTransactionSchema = z
  .object({
    amountCents: positiveCents.optional(),
    accountId: id.optional(),
    toAccountId: id.optional(),
    categoryId: id.optional(),
    date: isoDate.optional(),
    description: z.string().trim().max(120).optional(),
    notes,
    status: z.enum(["posted", "planned"]).optional(),
  })
  .strict();
export type UpdateTransaction = z.infer<typeof updateTransactionSchema>;

export const listTransactionsQuery = z.object({
  month: yearMonth,
  accountId: id.optional(),
  categoryId: id.optional(),
  kind: z.enum(TRANSACTION_KINDS).optional(),
  status: z.enum(["posted", "planned"]).optional(),
  q: z.string().trim().max(60).optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});
export type ListTransactionsQuery = z.input<typeof listTransactionsQuery>;

export type Transaction = {
  id: string;
  kind: TransactionKind;
  amountCents: number;
  accountId: string;
  toAccountId: string | null;
  categoryId: string | null;
  date: string;
  description: string;
  notes: string | null;
  status: TransactionStatus;
  source: "manual" | "recurring" | "import";
  installment: { no: number; total: number } | null;
  /** Compra no cartão: fatura em que cai. Pagamento: fatura que paga. YYYY-MM. */
  statementMonth: string | null;
};

export type TransactionPage = { items: Transaction[]; nextCursor: string | null };

/* ---------- cartão ---------- */

export type StatementStatus = "open" | "closed" | "paid" | "overdue";

export const STATEMENT_STATUS_LABEL: Record<StatementStatus, string> = {
  open: "Aberta",
  closed: "Fechada",
  paid: "Paga",
  overdue: "Vencida",
};

export type StatementSummary = {
  month: string;
  closeDate: string;
  dueDate: string;
  status: StatementStatus;
  /** Compras − estornos da fatura (inclui previstos). */
  totalCents: number;
  plannedCents: number;
  paidCents: number;
  remainingCents: number;
};

export type Statement = StatementSummary & { items: Transaction[] };

export type CardOverview = {
  accountId: string;
  creditLimitCents: number;
  usedCents: number;
  availableCents: number;
  /** Fatura aberta agora (recebe as compras de hoje). */
  openMonth: string;
  /** Fatura que pede atenção: a mais antiga com saldo a pagar, ou a aberta. */
  focusMonth: string;
  /** Faturas com saldo a pagar (fechadas ou vencidas) + a aberta. */
  pending: StatementSummary[];
  /** Total já comprometido nas próximas 6 faturas, a partir da aberta. */
  upcoming: { month: string; totalCents: number }[];
  installments: {
    groupId: string;
    description: string;
    categoryId: string | null;
    perInstallmentCents: number;
    nextNo: number;
    total: number;
    remainingCents: number;
    lastMonth: string;
  }[];
};

export const deleteTransactionQuery = z.object({
  /** Em parcelas: "one" apaga só esta, "following" apaga esta e as próximas. */
  scope: z.enum(["one", "following"]).default("one"),
});

/* ---------- resumo do mês ---------- */

export type MonthSummary = {
  month: string;
  incomePostedCents: number;
  incomePlannedCents: number;
  expensePostedCents: number;
  expensePlannedCents: number;
  /** Gastos (realizado + previsto) por categoria, do maior para o menor. */
  byCategory: { categoryId: string | null; postedCents: number; plannedCents: number }[];
};
