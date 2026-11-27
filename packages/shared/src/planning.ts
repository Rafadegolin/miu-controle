import { z } from "zod";

const yearMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mês inválido.");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");
const MAX = 1_000_000_000_00;

/* ---------- orçamentos ---------- */

export type BudgetStatus = "ok" | "warning" | "over";

export const BUDGET_STATUS_LABEL: Record<BudgetStatus, string> = {
  ok: "No ritmo",
  warning: "Atenção",
  over: "Estourou",
};

export const setBudgetSchema = z
  .object({
    /** A partir de qual mês vale (meses anteriores mantêm o limite que tinham). */
    month: yearMonth,
    /** null remove o orçamento a partir deste mês. */
    amountCents: z.number().int().positive("O limite precisa ser maior que zero.").max(MAX).nullable(),
  })
  .strict();
export type SetBudget = z.infer<typeof setBudgetSchema>;

export type BudgetLine = {
  categoryId: string;
  limitCents: number;
  /** Realizado no mês. */
  spentCents: number;
  /** Ainda previsto no mês (recorrências, datas futuras). */
  plannedCents: number;
  status: BudgetStatus;
  /** Quanto dá para gastar por dia até o fim do mês (só no mês atual). */
  dailyAllowanceCents: number | null;
};

export type BudgetMonth = {
  month: string;
  lines: BudgetLine[];
  totals: { limitCents: number; spentCents: number; plannedCents: number; status: BudgetStatus };
  dailyAllowanceCents: number | null;
  /** Categorias de despesa sem orçamento, com a média dos últimos 3 meses e um limite sugerido. */
  suggestions: { categoryId: string; averageCents: number; suggestedCents: number }[];
};

/* ---------- metas ---------- */

const name = z.string().trim().min(1, "Dê um nome para a meta.").max(60);
const color = z.string().regex(/^#[0-9a-f]{6}$/i);

export const createGoalSchema = z
  .object({
    name,
    targetCents: z.number().int().positive("Quanto você quer juntar?").max(MAX),
    targetDate: isoDate.nullable().optional(),
    color: color.default("#1fbf8f"),
    /** Quanto já tem guardado para isso, se tiver. */
    initialCents: z.number().int().min(0).max(MAX).optional(),
    /**
     * Guardar numa caixinha (conta poupança criada para a meta): o dinheiro sai de uma conta ao
     * guardar. cdiPercent = % do CDI × 100 (10000 = 100%); null = não rende.
     */
    box: z
      .object({ cdiPercent: z.number().int().min(1).max(50000).nullable() })
      .strict()
      .optional(),
    /** Ou ligar a uma poupança/investimento que você já tem. */
    accountId: z.string().min(1).max(64).optional(),
  })
  .strict();
export type CreateGoal = z.input<typeof createGoalSchema>;

export const updateGoalSchema = z
  .object({
    name: name.optional(),
    targetCents: z.number().int().positive().max(MAX).optional(),
    targetDate: isoDate.nullable().optional(),
    color: color.optional(),
  })
  .strict();
export type UpdateGoal = z.infer<typeof updateGoalSchema>;

export const contributionSchema = z
  .object({
    /** Positivo = aporte; negativo = retirada. */
    amountCents: z
      .number()
      .int()
      .refine((v) => v !== 0, "Informe um valor.")
      .refine((v) => Math.abs(v) <= MAX, "Valor alto demais."),
    date: isoDate,
    note: z.string().trim().max(120).nullable().optional(),
  })
  .strict();
export type ContributionInput = z.infer<typeof contributionSchema>;

export type Goal = {
  id: string;
  name: string;
  targetCents: number;
  targetDate: string | null;
  color: string;
  archived: boolean;
  savedCents: number;
  /** 0..1 (pode passar de 1 se juntou mais que o alvo). */
  progress: number;
  /** Quanto guardar por mês para chegar na data; null sem data. */
  monthlyNeededCents: number | null;
  /** Média de aportes por mês nos últimos 3 meses. */
  recentMonthlyCents: number;
  /** Caixinha da meta: o guardado é o saldo dela. null = meta só de acompanhamento. */
  box: {
    accountId: string;
    accountName: string;
    /** % do CDI × 100 (10000 = 100%); null = não rende. */
    cdiPercent: number | null;
    /** Rendimento estimado do mês atual até hoje. */
    monthYieldCents: number;
    /** CDI atual em % ao ano (null sem taxa ainda). */
    cdiAnnualPercent: number | null;
  } | null;
};

export type GoalContribution = {
  id: string;
  amountCents: number;
  date: string;
  note: string | null;
  /** Movimento da caixinha (transferência ou rendimento): não se apaga por aqui. */
  fromBox?: boolean;
};

/** Guardar (in) na caixinha a partir de uma conta, ou resgatar (out) para ela. */
export const boxMoveSchema = z
  .object({
    direction: z.enum(["in", "out"]),
    amountCents: z.number().int().positive("Informe um valor.").max(MAX),
    /** Conta de onde sai (guardar) ou para onde volta (resgatar). */
    accountId: z.string().min(1).max(64),
    date: isoDate,
  })
  .strict();
export type BoxMove = z.infer<typeof boxMoveSchema>;

/** Transformar uma meta só de acompanhamento em caixinha. */
export const convertGoalSchema = z
  .object({ cdiPercent: z.number().int().min(1).max(50000).nullable() })
  .strict();
export type ConvertGoal = z.infer<typeof convertGoalSchema>;
