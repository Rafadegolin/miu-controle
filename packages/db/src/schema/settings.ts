import { bigint, boolean, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
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
  /** Limite de gastos do mês (todas as despesas). Opcional; alimenta o "ritmo de gastos". */
  monthlySpendingLimitCents: bigint({ mode: "number" }),
  /** Avisos por e-mail (orçamento perto do limite, fatura vencendo). */
  emailAlerts: boolean().notNull().default(true),
  onboardingCompletedAt: timestamp({ withTimezone: true }),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/**
 * Avisos já enviados. A chave identifica o aviso (ex.: "budget:<categoria>:2026-11:warning")
 * e garante que cada um sai uma vez só, mesmo se a rotina rodar de novo.
 */
export const sentAlerts = pgTable(
  "sent_alerts",
  {
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    key: text().notNull(),
    sentAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.key] })],
);
