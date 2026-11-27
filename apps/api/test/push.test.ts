import { todayIn } from "@miu/core";
import { eq, schema } from "@miu/db";
import type { Account, Category, Me, PushConfig, PushDevice } from "@miu/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runAlerts, runReminders } from "../src/lib/alerts";
import type { Mailer } from "../src/lib/mailer";
import { APP_URL, setup, signUpVerified } from "./harness";

let t: Awaited<ReturnType<typeof setup>>;
let ana: string;
const today = todayIn("America/Sao_Paulo");
const month = today.slice(0, 7);
const KEYS = { p256dh: `B${"a".repeat(86)}`, auth: "c".repeat(22) };
const ENDPOINT = "https://push.exemplo/aparelho-1";
const noMail: Mailer = { async send() {} };

async function json<T>(res: Response | Promise<Response>, status = 200): Promise<T> {
  const r = await res;
  if (r.status !== status) throw new Error(`esperava ${status}, veio ${r.status}: ${await r.text()}`);
  return r.status === 204 ? (undefined as T) : ((await r.json()) as T);
}
const send = (method: string, path: string, body?: object, cookie = ana) =>
  t.req(path, { method, cookie, ...(body ? { json: body } : {}) });
const subscribe = (endpoint = ENDPOINT, cookie = ana) =>
  json(
    send("POST", "/api/push/subscriptions", { endpoint, keys: KEYS, device: "iPhone · Safari" }, cookie),
    201,
  );
const devices = (cookie = ana) => json<PushDevice[]>(t.req("/api/push/subscriptions", { cookie }));

beforeEach(async () => {
  t = await setup({ VAPID_PUBLIC_KEY: "chave-publica" });
  ana = await signUpVerified(t);
});
afterEach(async () => t?.close());

describe("aparelhos com push", () => {
  it("ativa, testa e desativa o aparelho", async () => {
    expect(await json<PushConfig>(t.req("/api/push/config", { cookie: ana }))).toEqual({
      publicKey: "chave-publica",
    });
    await subscribe();
    await subscribe(); // de novo: atualiza, não duplica
    expect(await devices()).toEqual([
      expect.objectContaining({ device: "iPhone · Safari", lastSuccessAt: null }),
    ]);

    expect(await json(send("POST", "/api/push/test", { endpoint: ENDPOINT }))).toEqual({
      sent: 1,
      failed: 0,
    });
    expect(t.pushed.at(-1)).toMatchObject({
      endpoint: ENDPOINT,
      message: { title: "Tudo certo! 🐱", url: "/configuracoes" },
    });
    expect((await devices())[0]?.lastSuccessAt).not.toBeNull();

    await json(send("DELETE", "/api/push/subscriptions", { endpoint: ENDPOINT }), 204);
    expect(await devices()).toEqual([]);
    await json(send("POST", "/api/push/test", { endpoint: ENDPOINT }), 404);
  });

  it("aparelho que saiu do serviço (410) é apagado; recusa vira erro claro", async () => {
    await subscribe();
    t.pushStatus.value = 500;
    const r = await send("POST", "/api/push/test", { endpoint: ENDPOINT });
    expect(r.status).toBe(502);
    expect((await r.json()) as { mensagem: string }).toMatchObject({
      mensagem: expect.stringContaining("recusou"),
    });
    expect(await devices()).toHaveLength(1);
    t.pushStatus.value = 410;
    await json(send("POST", "/api/push/test", { endpoint: ENDPOINT }), 502);
    expect(await devices()).toEqual([]);
  });

  it("valida a inscrição: só https e chaves no formato certo", async () => {
    await json(
      send("POST", "/api/push/subscriptions", { endpoint: "http://push.exemplo/x", keys: KEYS }),
      400,
    );
    await json(
      send("POST", "/api/push/subscriptions", { endpoint: ENDPOINT, keys: { p256dh: "x", auth: KEYS.auth } }),
      400,
    );
  });

  it("é isolado: não lista, não apaga e não testa aparelho de outra pessoa", async () => {
    await subscribe();
    const bia = await signUpVerified(t, "bia@exemplo.com");
    expect(await devices(bia)).toEqual([]);
    await json(send("DELETE", "/api/push/subscriptions", { endpoint: ENDPOINT }, bia), 204);
    expect(await devices()).toHaveLength(1);
    await json(send("POST", "/api/push/test", { endpoint: ENDPOINT }, bia), 404);
    // o mesmo aparelho entrando na conta da Bia passa a ser dela
    await subscribe(ENDPOINT, bia);
    expect(await devices()).toEqual([]);
    expect(await devices(bia)).toHaveLength(1);
  });

  it("sem chaves VAPID no servidor, o push fica desligado", async () => {
    const off = await setup();
    try {
      const cookie = await signUpVerified(off);
      expect(await json<PushConfig>(off.req("/api/push/config", { cookie }))).toEqual({ publicKey: null });
    } finally {
      await off.close();
    }
  });

  it("guarda as preferências de notificação", async () => {
    expect((await json<Me>(t.req("/api/me", { cookie: ana }))).settings).toMatchObject({
      pushAlerts: true,
      pushReminder: false,
    });
    const me = await json<Me>(send("PATCH", "/api/me", { pushAlerts: false, pushReminder: true }));
    expect(me.settings).toMatchObject({ pushAlerts: false, pushReminder: true });
  });
});

describe("avisos e lembrete por push", () => {
  async function overBudget() {
    const conta = await json<Account>(
      send("POST", "/api/accounts", { name: "Conta", kind: "checking", initialBalanceCents: 1_000_000 }),
      201,
    );
    const cats = await json<Category[]>(t.req("/api/categories", { cookie: ana }));
    const mercado = cats.find((c) => c.name === "Mercado")?.id ?? "";
    await json(send("PUT", `/api/budgets/${mercado}`, { month, amountCents: 100_000 }));
    await json(
      send("POST", "/api/transactions", {
        kind: "expense",
        amountCents: 90_000,
        accountId: conta.id,
        categoryId: mercado,
        date: today,
      }),
      201,
    );
  }

  it("manda o aviso por push uma vez só, independente do e-mail", async () => {
    await subscribe();
    await overBudget();
    // o e-mail já saiu antes (sem aparelho, sem push): não impede o push depois
    await runAlerts(t.db, noMail, APP_URL, new Date(), null);
    expect(await runAlerts(t.db, noMail, APP_URL, new Date(), t.push)).toMatchObject({
      emailsSent: 0,
      pushed: 1,
    });
    expect(t.pushed.at(-1)?.message).toMatchObject({
      title: "Mercado: 90% do orçamento",
      url: "/orcamentos",
    });
    expect(await runAlerts(t.db, noMail, APP_URL, new Date(), t.push)).toMatchObject({ pushed: 0 });
    expect(t.pushed).toHaveLength(1);
  });

  it("respeita quem desligou os avisos por push e tenta de novo se não entregou", async () => {
    await subscribe();
    await overBudget();
    t.pushStatus.value = 500;
    await runAlerts(t.db, noMail, APP_URL, new Date(), t.push);
    t.pushStatus.value = 201;
    await runAlerts(t.db, noMail, APP_URL, new Date(), t.push);
    expect(t.pushed).toHaveLength(2); // a primeira falhou, a segunda entregou
    await json(send("PATCH", "/api/me", { pushAlerts: false }));
    await t.db.delete(schema.sentAlerts);
    await runAlerts(t.db, noMail, APP_URL, new Date(), t.push);
    expect(t.pushed).toHaveLength(2);
  });

  it("lembrete à noite só para quem ligou e não lançou nada hoje, uma vez", async () => {
    await subscribe();
    expect(await runReminders(t.db, t.push)).toEqual({ reminded: 0 }); // desligado por padrão
    await json(send("PATCH", "/api/me", { pushReminder: true }));
    expect(await runReminders(t.db, t.push)).toEqual({ reminded: 1 });
    expect(t.pushed.at(-1)?.message).toMatchObject({ title: "Lançou tudo hoje?", url: "/inicio?novo=gasto" });
    expect(await runReminders(t.db, t.push)).toEqual({ reminded: 0 }); // uma vez por dia

    await t.db.delete(schema.sentAlerts).where(eq(schema.sentAlerts.key, `push:reminder:${today}`));
    await overBudget(); // lançou algo hoje
    expect(await runReminders(t.db, t.push)).toEqual({ reminded: 0 });
  });
});
