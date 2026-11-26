import { z } from "zod";

export const FREQUENCIES = ["monthly", "weekly", "yearly"] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  monthly: "Mensal",
  weekly: "Semanal",
  yearly: "Anual",
};

const id = z.string().min(1).max(64);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");
const amount = z
  .number({ error: "Informe um valor." })
  .int()
  .positive("Informe um valor maior que zero.")
  .max(1_000_000_000_00, "Valor alto demais.");

const base = {
  amountCents: amount,
  accountId: id,
  description: z.string().trim().min(1, "Dê um nome, como Aluguel ou Salário.").max(120),
  frequency: z.enum(FREQUENCIES).default("monthly"),
  interval: z.number().int().min(1).max(12).default(1),
  /** Mensal/anual: dia (1–31). Sem ele, usa o dia da data de início. */
  dayOfMonth: z.number().int().min(1).max(31).nullable().optional(),
  startDate: isoDate,
  endDate: isoDate.nullable().optional(),
  autoPost: z.boolean().default(false),
};

export const createRecurringSchema = z
  .discriminatedUnion("kind", [
    z.object({ kind: z.enum(["income", "expense"]), categoryId: id, ...base }).strict(),
    z.object({ kind: z.literal("transfer"), toAccountId: id, ...base }).strict(),
  ])
  .refine((r) => !r.endDate || r.endDate >= r.startDate, {
    message: "A data final precisa ser depois do início.",
    path: ["endDate"],
  });
export type CreateRecurring = z.input<typeof createRecurringSchema>;

export const updateRecurringSchema = z
  .object({
    amountCents: amount.optional(),
    accountId: id.optional(),
    toAccountId: id.optional(),
    categoryId: id.optional(),
    description: z.string().trim().min(1).max(120).optional(),
    frequency: z.enum(FREQUENCIES).optional(),
    interval: z.number().int().min(1).max(12).optional(),
    dayOfMonth: z.number().int().min(1).max(31).nullable().optional(),
    startDate: isoDate.optional(),
    endDate: isoDate.nullable().optional(),
    autoPost: z.boolean().optional(),
  })
  .strict();
export type UpdateRecurring = z.infer<typeof updateRecurringSchema>;

export type RecurringRule = {
  id: string;
  kind: "income" | "expense" | "transfer";
  amountCents: number;
  /** Valor médio por mês (semanal × 52 / 12, anual / 12…). */
  monthlyCents: number;
  accountId: string;
  toAccountId: string | null;
  categoryId: string | null;
  description: string;
  frequency: Frequency;
  interval: number;
  dayOfMonth: number | null;
  startDate: string;
  endDate: string | null;
  autoPost: boolean;
  paused: boolean;
  /** Próxima ocorrência a partir de hoje; null se pausada ou encerrada. */
  nextDate: string | null;
};

/** Texto curto da frequência: "Todo dia 10", "Toda semana", "A cada 2 meses, dia 5"… */
export function describeFrequency(
  r: Pick<RecurringRule, "frequency" | "interval" | "dayOfMonth" | "startDate">,
) {
  const day = r.dayOfMonth ?? Number(r.startDate.slice(8, 10));
  const weekdays = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  if (r.frequency === "weekly") {
    const [y, m, d] = r.startDate.split("-").map(Number) as [number, number, number];
    const wd = weekdays[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
    return r.interval === 1 ? `Toda ${wd}` : `A cada ${r.interval} semanas, ${wd}`;
  }
  if (r.frequency === "yearly") {
    const months = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
    return `Todo ano, ${day} ${months[Number(r.startDate.slice(5, 7)) - 1]}`;
  }
  return r.interval === 1 ? `Todo dia ${day}` : `A cada ${r.interval} meses, dia ${day}`;
}
