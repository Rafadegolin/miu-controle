import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

/*
 * Modelo financeiro. Regras que o banco garante (além da API):
 * - dinheiro em centavos, sempre positivo; o sinal vem do `kind`
 * - transferência = UMA linha com conta de origem (account_id) e destino (to_account_id)
 * - saldo nunca é gravado: é derivado de initial_balance + transações "posted"
 */

const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const ACCOUNT_KINDS = ["checking", "savings", "cash", "investment", "credit_card"] as const;
export const CATEGORY_KINDS = ["income", "expense"] as const;
export const TRANSACTION_KINDS = ["income", "expense", "transfer"] as const;
export const TRANSACTION_STATUSES = ["posted", "planned"] as const;
export const TRANSACTION_SOURCES = ["manual", "recurring", "import"] as const;
export const FREQUENCIES = ["monthly", "weekly", "yearly"] as const;

export const accounts = pgTable(
  "accounts",
  {
    id: text().primaryKey(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text().notNull(),
    kind: text({ enum: ACCOUNT_KINDS }).notNull(),
    initialBalanceCents: bigint({ mode: "number" }).notNull().default(0),
    color: text().notNull(),
    // Cartão de crédito (Fase 3)
    creditLimitCents: bigint({ mode: "number" }),
    closingDay: integer(),
    dueDay: integer(),
    sortOrder: integer().notNull().default(0),
    archivedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index().on(t.userId),
    check("accounts_kind_check", sql`${t.kind} in ('checking','savings','cash','investment','credit_card')`),
    check(
      "accounts_card_fields_check",
      sql`(${t.kind} = 'credit_card') = (${t.closingDay} is not null and ${t.dueDay} is not null)`,
    ),
    check("accounts_days_check", sql`${t.closingDay} between 1 and 28 and ${t.dueDay} between 1 and 28`),
  ],
);

export const categories = pgTable(
  "categories",
  {
    id: text().primaryKey(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text().notNull(),
    kind: text({ enum: CATEGORY_KINDS }).notNull(),
    color: text().notNull(),
    icon: text().notNull(),
    sortOrder: integer().notNull().default(0),
    archivedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [index().on(t.userId), check("categories_kind_check", sql`${t.kind} in ('income','expense')`)],
);

/**
 * Regra de recorrência: gera lançamentos "previstos" à frente (ver apps/api/src/lib/recurring.ts).
 * `generatedUntil` = até que data já foram criadas as ocorrências.
 */
export const recurringRules = pgTable(
  "recurring_rules",
  {
    id: text().primaryKey(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text({ enum: TRANSACTION_KINDS }).notNull(),
    amountCents: bigint({ mode: "number" }).notNull(),
    accountId: text()
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    toAccountId: text().references(() => accounts.id, { onDelete: "restrict" }),
    categoryId: text().references(() => categories.id, { onDelete: "set null" }),
    description: text().notNull(),
    frequency: text({ enum: FREQUENCIES }).notNull(),
    interval: integer().notNull().default(1),
    dayOfMonth: integer(),
    startDate: date({ mode: "string" }).notNull(),
    endDate: date({ mode: "string" }),
    /** Lançar sozinho como realizado no dia (ex.: débito automático). */
    autoPost: boolean().notNull().default(false),
    pausedAt: timestamp({ withTimezone: true }),
    generatedUntil: date({ mode: "string" }),
    ...timestamps,
  },
  (t) => [
    index().on(t.userId),
    check("recurring_amount_check", sql`${t.amountCents} > 0`),
    check("recurring_interval_check", sql`${t.interval} between 1 and 12`),
    check("recurring_day_check", sql`${t.dayOfMonth} between 1 and 31`),
    check("recurring_frequency_check", sql`${t.frequency} in ('monthly','weekly','yearly')`),
    check("recurring_transfer_check", sql`(${t.kind} = 'transfer') = (${t.toAccountId} is not null)`),
  ],
);

export const transactions = pgTable(
  "transactions",
  {
    id: text().primaryKey(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accountId: text()
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    /** Só em transferências: conta que recebe. */
    toAccountId: text().references(() => accounts.id, { onDelete: "restrict" }),
    categoryId: text().references(() => categories.id, { onDelete: "set null" }),
    kind: text({ enum: TRANSACTION_KINDS }).notNull(),
    amountCents: bigint({ mode: "number" }).notNull(),
    /** Data do lançamento, sem fuso (YYYY-MM-DD). */
    date: date({ mode: "string" }).notNull(),
    description: text().notNull(),
    notes: text(),
    status: text({ enum: TRANSACTION_STATUSES }).notNull().default("posted"),
    source: text({ enum: TRANSACTION_SOURCES }).notNull().default("manual"),
    // Cartão e parcelas (Fase 3)
    statementMonth: date({ mode: "string" }),
    installmentGroupId: text(),
    installmentNo: integer(),
    installmentTotal: integer(),
    // Recorrência (Fase 4) e importação (Fase 7)
    recurringRuleId: text().references(() => recurringRules.id, { onDelete: "set null" }),
    importBatchId: text(),
    importFitid: text(),
    ...timestamps,
  },
  (t) => [
    index("transactions_user_date_idx").on(t.userId, t.date.desc(), t.id.desc()),
    index("transactions_account_date_idx").on(t.accountId, t.date),
    index("transactions_to_account_idx").on(t.toAccountId).where(sql`${t.toAccountId} is not null`),
    index("transactions_category_idx").on(t.userId, t.categoryId, t.date),
    // Uma ocorrência por regra por dia: gerar de novo nunca duplica.
    uniqueIndex("transactions_rule_date_uq")
      .on(t.recurringRuleId, t.date)
      .where(sql`${t.recurringRuleId} is not null`),
    check("transactions_amount_check", sql`${t.amountCents} > 0`),
    check("transactions_kind_check", sql`${t.kind} in ('income','expense','transfer')`),
    check("transactions_status_check", sql`${t.status} in ('posted','planned')`),
    check(
      "transactions_transfer_check",
      sql`(${t.kind} = 'transfer') = (${t.toAccountId} is not null) and (${t.toAccountId} is null or ${t.toAccountId} <> ${t.accountId})`,
    ),
    check("transactions_transfer_category_check", sql`${t.kind} <> 'transfer' or ${t.categoryId} is null`),
  ],
);
