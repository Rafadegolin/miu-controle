import { describe, expect, it } from "vitest";
import { setup } from "../test/harness";
import { createApp } from "./app";
import type { Bindings } from "./env";

describe("api", () => {
  it("health responde 503 sem Hyperdrive configurado", async () => {
    const app = createApp();
    const res = await app.request("/api/health", {}, { APP_ENV: "test" } as Bindings);
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toMatchObject({
      ok: false,
      versao: "local",
      banco: { ok: false, latenciaMs: null, erro: "Hyperdrive não configurado" },
    });
  });

  it("health responde 200 com banco de verdade", async () => {
    const t = await setup();
    const res = await t.req("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, banco: { ok: true } });
    await t.close();
  });

  it("rota desconhecida devolve 404 no formato padrão e com cabeçalhos de segurança", async () => {
    const app = createApp();
    const res = await app.request("/api/nao-existe", {}, { APP_ENV: "test" } as Bindings);
    expect(res.status).toBe(404);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await res.json()).toEqual({ erro: "nao_encontrado", mensagem: "Rota não encontrada." });
  });
});
