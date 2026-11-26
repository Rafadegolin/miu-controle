import { createDb } from "@miu/db";
import { createApp } from "./app";
import type { Bindings } from "./env";
import { runAlerts } from "./lib/alerts";
import { mailerFor } from "./lib/mailer";
import { runDaily } from "./lib/recurring";

const app = createApp();

export default {
  fetch: app.fetch,

  /**
   * Cron diário (wrangler.jsonc → triggers):
   * 1. gera previsões das recorrências e lança os automáticos;
   * 2. manda os avisos do dia (orçamento e fatura), um e-mail por pessoa.
   */
  async scheduled(_event, env, ctx) {
    if (!env.HYPERDRIVE) return;
    const { db, close } = createDb(env.HYPERDRIVE.connectionString, { maxConnections: 1 });
    ctx.waitUntil(
      (async () => {
        try {
          console.log("cron_recorrencias", await runDaily(db));
          console.log("cron_avisos", await runAlerts(db, mailerFor(env), env.APP_URL));
        } catch (err) {
          console.error("cron_falhou", err);
        } finally {
          await close();
        }
      })(),
    );
  },
} satisfies ExportedHandler<Bindings>;
