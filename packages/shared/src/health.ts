import { z } from "zod";

export const healthSchema = z.object({
  ok: z.boolean(),
  versao: z.string(),
  banco: z.object({
    ok: z.boolean(),
    latenciaMs: z.number().nullable(),
    erro: z.string().optional(),
  }),
  colo: z.string().nullable(),
});

export type Health = z.infer<typeof healthSchema>;
