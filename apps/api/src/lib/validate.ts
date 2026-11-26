import { zValidator } from "@hono/zod-validator";
import type { ValidationTargets } from "hono";
import type { ZodType } from "zod";

/** Validação Zod com o erro no formato padrão da API (o ZodError cai no onError global). */
export const valid = <T extends ZodType, K extends keyof ValidationTargets>(target: K, schema: T) =>
  zValidator(target, schema, (result) => {
    if (!result.success) throw result.error;
  });
