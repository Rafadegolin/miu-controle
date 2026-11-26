import { sql } from "drizzle-orm";
import { bigint, check, date, index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { categories } from "./finance";

const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/**
 * Orçamento = limite mensal por categoria, com UM significado só:
 * o limite do mês M é a linha com o maior `validFrom` <= M. Mudar o limite a partir de um mês cria
 * (ou atualiza) a linha daquele mês; meses anteriores continuam com o limite que tinham.
 * `amountCents` nulo = sem orçamento a partir daquele mês.
 */
export const budgets = pgTable(
  "budgets",
  {
    id: text().primaryKey(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    categoryId: text()
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    /** Primeiro dia do mês (YYYY-MM-01). */
    validFrom: date({ mode: "string" }).notNull(),
    amountCents: bigint({ mode: "number" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("budgets_user_category_month_uq").on(t.userId, t.categoryId, t.validFrom),
    check("budgets_amount_check", sql`${t.amountCents} is null or ${t.amountCents} > 0`),
    check("budgets_month_start_check", sql`extract(day from ${t.validFrom}) = 1`),
  ],
);

/** Meta: um "pote" virtual. O guardado é a soma dos aportes; não mexe no saldo das contas. */
export const goals = pgTable(
  "goals",
  {
    id: text().primaryKey(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text().notNull(),
    targetCents: bigint({ mode: "number" }).notNull(),
    targetDate: date({ mode: "string" }),
    color: text().notNull(),
    archivedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [index().on(t.userId), check("goals_target_check", sql`${t.targetCents} > 0`)],
);

export const goalContributions = pgTable(
  "goal_contributions",
  {
    id: text().primaryKey(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    goalId: text()
      .notNull()
      .references(() => goals.id, { onDelete: "cascade" }),
    /** Positivo = aporte; negativo = retirada. */
    amountCents: bigint({ mode: "number" }).notNull(),
    date: date({ mode: "string" }).notNull(),
    note: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.goalId, t.date), check("goal_contrib_amount_check", sql`${t.amountCents} <> 0`)],
);
