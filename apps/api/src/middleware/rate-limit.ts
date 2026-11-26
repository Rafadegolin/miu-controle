import { createMiddleware } from "hono/factory";
import type { App } from "../env";
import { HttpError } from "../lib/errors";

/**
 * Limita tentativas de login, cadastro e recuperação de senha por IP (binding grátis da Cloudflare).
 * Sem o binding (dev/testes) não limita.
 */
const PROTECTED = [
  "/sign-in/",
  "/sign-up/",
  "/request-password-reset",
  "/reset-password",
  "/send-verification-email",
];

export const authRateLimit = createMiddleware<App>(async (c, next) => {
  const limiter = c.env.AUTH_LIMITER;
  if (limiter && c.req.method === "POST" && PROTECTED.some((p) => c.req.path.includes(p))) {
    const ip = c.req.header("cf-connecting-ip") ?? "local";
    const { success } = await limiter.limit({ key: `auth:${ip}` });
    if (!success) {
      throw new HttpError(
        429,
        "muitas_tentativas",
        "Muitas tentativas seguidas. Espere um minuto e tente de novo.",
      );
    }
  }
  await next();
});
