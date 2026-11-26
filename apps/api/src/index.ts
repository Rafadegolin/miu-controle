import { createDb } from "@miu/db";
import { createApp } from "./app";
import type { Bindings } from "./env";
import { runDaily } from "./lib/recurring";

const app = createApp();

export default {
  fetch: app.fetch,

  /** Cron diário (wrangler.jsonc → triggers): gera previsões das recorrências e lança os automáticos. */
  async scheduled(_event, env, ctx) {
    if (!env.HYPERDRIVE) return;
    const { db, close } = createDb(env.HYPERDRIVE.connectionString, { maxConnections: 1 });
    ctx.waitUntil(
      runDaily(db)
        .then((r) => console.log("cron_recorrencias", r))
        .catch((err) => console.error("cron_recorrencias_falhou", err))
        .finally(close),
    );
  },
} satisfies ExportedHandler<Bindings>;
