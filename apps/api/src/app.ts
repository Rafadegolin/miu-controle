import { Hono } from "hono";
import { csrf } from "hono/csrf";
import { secureHeaders } from "hono/secure-headers";
import type { App } from "./env";
import { notFound, onError } from "./lib/errors";
import { contextMiddleware, type Deps, defaultDeps } from "./middleware/context";
import { authRateLimit } from "./middleware/rate-limit";
import { accountsRoutes } from "./routes/accounts";
import { budgetsRoutes } from "./routes/budgets";
import { cardsRoutes } from "./routes/cards";
import { categoriesRoutes } from "./routes/categories";
import { dashboardRoutes, reportsRoutes } from "./routes/dashboard";
import { goalsRoutes } from "./routes/goals";
import { health } from "./routes/health";
import { exportRoutes, importRoutes } from "./routes/imports";
import { insightsRoutes } from "./routes/insights";
import { me } from "./routes/me";
import { pushRoutes } from "./routes/push";
import { recurringRoutes } from "./routes/recurring";
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
    .route("/transactions", transactionsRoutes)
    .route("/cards", cardsRoutes)
    .route("/recurring", recurringRoutes)
    .route("/budgets", budgetsRoutes)
    .route("/goals", goalsRoutes)
    .route("/dashboard", dashboardRoutes)
    .route("/reports", reportsRoutes)
    .route("/import", importRoutes)
    .route("/export", exportRoutes)
    .route("/insights", insightsRoutes)
    .route("/push", pushRoutes);

  app.notFound(notFound);
  app.onError(onError);

  return routes;
}

export type AppType = ReturnType<typeof createApp>;
