import { bigint, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth";

/** Preferências do usuário. Uma linha por usuário, criada no primeiro acesso. */
export const userSettings = pgTable("user_settings", {
  userId: text()
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  timezone: text().notNull().default("America/Sao_Paulo"),
  currency: text().notNull().default("BRL"),
  /** Renda mensal aproximada, opcional; só para sugerir orçamentos. */
  monthlyIncomeCents: bigint({ mode: "number" }),
  onboardingCompletedAt: timestamp({ withTimezone: true }),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
