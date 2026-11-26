import { createMiddleware } from "hono/factory";
import type { App } from "../env";
import { HttpError } from "../lib/errors";

/** Exige sessão válida e e-mail verificado. Preenche `c.var.user`. */
export const requireUser = createMiddleware<App>(async (c, next) => {
  const session = await c.var.auth().api.getSession({ headers: c.req.raw.headers });
  if (!session) throw new HttpError(401, "nao_autenticado", "Entre na sua conta para continuar.");
  const { id, email, name, emailVerified } = session.user;
  c.set("user", { id, email, name, emailVerified });
  await next();
});
