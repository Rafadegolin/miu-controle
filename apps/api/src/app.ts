import { Hono } from "hono";
import { csrf } from "hono/csrf";
import { secureHeaders } from "hono/secure-headers";
import type { App } from "./env";
import { notFound, onError } from "./lib/errors";
import { contextMiddleware, type Deps, defaultDeps } from "./middleware/context";
import { authRateLimit } from "./middleware/rate-limit";
import { accountsRoutes } from "./routes/accounts";
import { categoriesRoutes } from "./routes/categories";
import { health } from "./routes/health";
import { me } from "./routes/me";
import { transactionsRoutes } from "./routes/transactions";

export function createApp(deps: Deps = defaultDeps) {
  const app = new Hono<App>().basePath("/api");

  app.use(secureHeaders());
  app.use(csrf());
  app.use(contextMiddleware(deps));

  // Better Auth cuida de /api/auth/* (cadastro, login, sessões, verificação, reset, Google).
  app.use("/auth/*", authRateLimit);
  app.on(["GET", "POST"], "/auth/*", (c) => c.var.auth().handler(c.req.raw));

  // Cada grupo de rotas exporta seu tipo para o cliente RPC (hc) do frontend.
  const routes = app
    .route("/health", health)
    .route("/me", me)
    .route("/accounts", accountsRoutes)
    .route("/categories", categoriesRoutes)
    .route("/transactions", transactionsRoutes);

  app.notFound(notFound);
  app.onError(onError);

  return routes;
}

export type AppType = ReturnType<typeof createApp>;
