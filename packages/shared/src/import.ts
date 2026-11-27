import { z } from "zod";

const id = z.string().min(1).max(64);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");
const MAX = 1_000_000_000_00;
export const MAX_IMPORT_ROWS = 2000;

const parsedRow = z.object({
  date: isoDate,
  /** Com sinal, como no extrato: negativo saiu, positivo entrou. */
  amountCents: z
    .number()
    .int()
    .refine((v) => v !== 0 && Math.abs(v) <= MAX),
  description: z.string().trim().max(200),
  fitid: z.string().trim().max(120).optional(),
});

export const previewImportSchema = z
  .object({
    accountId: id,
    rows: z
      .array(parsedRow)
      .min(1, "Nenhum lançamento no arquivo.")
      .max(MAX_IMPORT_ROWS, "Arquivo grande demais: até 2.000 linhas por vez."),
    /**
     * Fatura de cartão costuma vir com compras POSITIVAS. Quando true, positivo = despesa.
     * Padrão: true em cartão, false em conta.
     */
    positiveIsExpense: z.boolean().optional(),
  })
  .strict();
export type PreviewImport = z.input<typeof previewImportSchema>;

export type ImportMatch = {
  /** "exact": mesmo FITID ou mesma data, valor e descrição. "probable": mesma data e valor. */
  level: "exact" | "probable";
  transactionId: string;
  description: string;
  date: string;
};

export type PreviewRow = {
  index: number;
  date: string;
  kind: "income" | "expense";
  amountCents: number;
  description: string;
  fitid: string | null;
  categoryId: string | null;
  /** De onde veio a sugestão de categoria. */
  categorySource: "history" | "keyword" | null;
  match: ImportMatch | null;
  /** Compra parcelada no cartão ("PARC 03/10"). explicit=false: só "03/10", pode ser data. */
  installment: { no: number; total: number; explicit: boolean } | null;
  /** Extrato da conta: parece pagamento de fatura deste cartão (vira transferência). */
  transferToCardId: string | null;
};

export type ImportPreview = {
  accountId: string;
  rows: PreviewRow[];
  /** Cartão: fatura que o arquivo parece ser (as parcelas entram nela e nas seguintes). */
  statementMonth: string | null;
};

export const confirmImportSchema = z
  .object({
    accountId: id,
    fileName: z.string().trim().min(1).max(200),
    rows: z
      .array(
        z.object({
          date: isoDate,
          kind: z.enum(["income", "expense"]),
          amountCents: z.number().int().positive().max(MAX),
          description: z.string().trim().min(1).max(120),
          categoryId: id.nullable(),
          fitid: z.string().trim().max(120).nullable().optional(),
          /** Cartão: cria esta parcela e as próximas nas faturas seguintes. */
          installment: z
            .object({ no: z.number().int().min(1).max(48), total: z.number().int().min(2).max(48) })
            .refine((i) => i.no <= i.total, "Parcela maior que o total.")
            .nullable()
            .optional(),
          /** Conta: grava como pagamento da fatura deste cartão (transferência). */
          toAccountId: id.nullable().optional(),
        }),
      )
      .min(1, "Selecione ao menos um lançamento.")
      .max(MAX_IMPORT_ROWS),
    /** Cartão: fatura em que entram as parcelas deste arquivo (YYYY-MM). */
    statementMonth: z
      .string()
      .regex(/^\d{4}-\d{2}$/, "Mês inválido.")
      .optional(),
  })
  .strict();
export type ConfirmImport = z.input<typeof confirmImportSchema>;

export type ImportResult = { batchId: string; inserted: number; skipped: number };

export type ImportBatch = {
  id: string;
  accountId: string;
  fileName: string;
  rowCount: number;
  /** Quantos ainda existem (o usuário pode ter apagado alguns). */
  remaining: number;
  createdAt: string;
};
