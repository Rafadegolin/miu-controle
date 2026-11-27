import { todayIn } from "@miu/core";
import { createDb } from "@miu/db";
import { createApp } from "./app";
import type { Bindings } from "./env";
import { runAlerts, runReminders } from "./lib/alerts";
import { mailerFor } from "./lib/mailer";
import { pushSenderFor } from "./lib/push";
import { runDaily } from "./lib/recurring";
import { postYields, syncCdi } from "./lib/yields";

const app = createApp();

/** Cron das 20h em Brasília (23:00 UTC): lembrete à noite. O das 8h (11:00 UTC) faz o resto. */
const REMINDER_CRON = "0 23 * * *";

export default {
  fetch: app.fetch,

  /**
   * Cron das 8h em Brasília (wrangler.jsonc → triggers):
   * 1. gera previsões das recorrências e lança os automáticos;
   * 2. busca o CDI no Banco Central e lança o rendimento do mês que acabou nas caixinhas;
   * 3. manda os avisos do dia (orçamento e fatura) por e-mail e push.
   * O das 20h só manda o lembrete opcional "Lançou tudo hoje?".
   */
  async scheduled(event, env, ctx) {
    if (!env.HYPERDRIVE) return;
    const { db, close } = createDb(env.HYPERDRIVE.connectionString, { maxConnections: 1 });
    ctx.waitUntil(
      (async () => {
        try {
          // 20h em Brasília: só o lembrete opcional da noite.
          if (event.cron === REMINDER_CRON) {
            console.log("cron_lembrete", await runReminders(db, pushSenderFor(env)));
            return;
          }
          console.log("cron_recorrencias", await runDaily(db));
          console.log("cron_cdi", await syncCdi(db, (url) => fetch(url), todayIn("America/Sao_Paulo")));
          console.log("cron_rendimentos", await postYields(db));
          console.log(
            "cron_avisos",
            await runAlerts(db, mailerFor(env), env.APP_URL, new Date(), pushSenderFor(env)),
          );
        } catch (err) {
          console.error("cron_falhou", err);
        } finally {
          await close();
        }
      })(),
    );
  },
} satisfies ExportedHandler<Bindings>;
