import { createDb, type Db } from "@miu/db";
import { createMiddleware } from "hono/factory";
import type { App, Bindings } from "../env";
import { createAuth } from "../lib/auth";
import { HttpError } from "../lib/errors";
import { type Mailer, mailerFor } from "../lib/mailer";

export type Deps = {
  /** Abre a conexão do banco da request. Em produção: postgres.js via Hyperdrive. */
  openDb: (env: Bindings) => { db: Db; close: () => Promise<void> };
  mailer: (env: Bindings) => Mailer;
};

export const defaultDeps: Deps = {
  openDb: (env) => {
    if (!env.HYPERDRIVE) throw new HttpError(503, "banco_indisponivel", "Banco de dados não configurado.");
    // Em dev o banco pode ser o PGlite local (processo único): uma conexão por request evita travar.
    return createDb(env.HYPERDRIVE.connectionString, {
      maxConnections: env.APP_ENV === "development" ? 1 : 5,
    });
  },
  mailer: mailerFor,
};

/**
 * Disponibiliza `c.var.db()` e `c.var.auth()`, criados só se a rota usar.
 * A conexão é encerrada depois da resposta (o pool de verdade fica no Hyperdrive).
 */
export const contextMiddleware = (deps: Deps) =>
  createMiddleware<App>(async (c, next) => {
    let conn: ReturnType<Deps["openDb"]> | undefined;
    const pending: Promise<unknown>[] = [];
    const defer = (p: Promise<unknown>) => {
      try {
        c.executionCtx.waitUntil(p);
      } catch {
        pending.push(p); // fora do Workers (testes): espera no fim da request
      }
    };

    const db = () => {
      conn ??= deps.openDb(c.env);
      return conn.db;
    };
    let auth: ReturnType<typeof createAuth> | undefined;

    c.set("db", db);
    c.set("auth", () => {
      auth ??= createAuth({ env: c.env, db: db(), mailer: deps.mailer(c.env), defer });
      return auth;
    });

    try {
      await next();
    } finally {
      await Promise.allSettled(pending);
      if (conn) defer(conn.close());
      await Promise.allSettled(pending);
    }
  });
