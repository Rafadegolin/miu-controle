import { z } from "zod";

export const updateMeSchema = z
  .object({
    name: z.string().trim().min(1, "Informe seu nome.").max(80, "Use até 80 caracteres.").optional(),
    monthlyIncomeCents: z
      .number()
      .int()
      .min(0, "A renda não pode ser negativa.")
      .max(100_000_000_00)
      .nullable()
      .optional(),
    timezone: z.string().min(1).max(64).optional(),
    emailAlerts: z.boolean().optional(),
    pushAlerts: z.boolean().optional(),
    pushReminder: z.boolean().optional(),
    monthlySpendingLimitCents: z
      .number()
      .int()
      .positive("O limite precisa ser maior que zero.")
      .max(100_000_000_00)
      .nullable()
      .optional(),
  })
  .strict();

export type UpdateMe = z.infer<typeof updateMeSchema>;

export type Me = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  settings: {
    timezone: string;
    currency: string;
    monthlyIncomeCents: number | null;
    onboardingCompleted: boolean;
    emailAlerts: boolean;
    pushAlerts: boolean;
    pushReminder: boolean;
    monthlySpendingLimitCents: number | null;
  };
};
