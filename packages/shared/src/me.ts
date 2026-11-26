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
  };
};
