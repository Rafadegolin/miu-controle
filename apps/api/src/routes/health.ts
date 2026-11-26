import { sql } from "@miu/db";
import type { Health } from "@miu/shared";
import { Hono } from "hono";
import type { App } from "../env";

export const health = new Hono<App>().get("/", async (c) => {
  const banco: Health["banco"] = { ok: false, latenciaMs: null };

  const inicio = Date.now();
  try {
    await c.var.db().execute(sql`select 1`);
    banco.ok = true;
    banco.latenciaMs = Date.now() - inicio;
  } catch (err) {
    console.error("health_db", err);
    banco.erro = c.env.HYPERDRIVE ? "Falha ao consultar o banco" : "Hyperdrive não configurado";
  }

  const body: Health = {
    ok: banco.ok,
    versao: c.env.CF_VERSION_METADATA?.id ?? "local",
    banco,
    colo: (c.req.raw as { cf?: { colo?: string } }).cf?.colo ?? null,
  };

  c.header("Cache-Control", "no-store");
  return c.json(body, banco.ok ? 200 : 503);
});
