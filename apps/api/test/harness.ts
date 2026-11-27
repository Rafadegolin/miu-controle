import type { Db } from "@miu/db";
import { createTestDb } from "@miu/db/testing";
import { createApp } from "../src/app";
import type { Bindings } from "../src/env";
import type { Email, Mailer } from "../src/lib/mailer";
import type { PushMessage, PushSender } from "../src/lib/web-push";

export const APP_URL = "http://localhost:5173";

/**
 * App completo contra um Postgres em memória. Cada `setup()` é um banco novo.
 * Os e-mails ficam em `outbox` para os testes seguirem os links.
 */
export async function setup(envOverrides: Partial<Bindings> = {}) {
  const { db, close } = await createTestDb();
  const outbox: Email[] = [];
  const mailer: Mailer = {
    async send(email) {
      outbox.push(email);
    },
  };
  // Push falso: guarda o que seria enviado; `pushStatus.value` simula a resposta do serviço de push.
  const pushed: { endpoint: string; message: PushMessage }[] = [];
  const pushStatus = { value: 201 };
  const push: PushSender = async (sub, message) => {
    pushed.push({ endpoint: sub.endpoint, message });
    const status = pushStatus.value;
    return { ok: status < 300, status, gone: status === 404 || status === 410 };
  };
  const app = createApp({
    openDb: () => ({ db, close: async () => {} }),
    mailer: () => mailer,
    push: () => push,
  });
  const env: Bindings = {
    APP_ENV: "test",
    APP_URL,
    BETTER_AUTH_SECRET: "segredo-de-teste-com-pelo-menos-32-caracteres!",
    ...envOverrides,
  };

  /** Faz a request mandando Origin (o Better Auth exige) e um cookie opcional. */
  const req = (path: string, init: RequestInit & { cookie?: string; json?: unknown } = {}) => {
    const headers = new Headers(init.headers);
    headers.set("origin", APP_URL);
    if (init.cookie) headers.set("cookie", init.cookie);
    let body = init.body;
    if (init.json !== undefined) {
      headers.set("content-type", "application/json");
      body = JSON.stringify(init.json);
    }
    return app.request(`${APP_URL}${path}`, { ...init, headers, body }, env);
  };

  return { app, db: db as Db, env, outbox, req, close, push, pushed, pushStatus };
}

/** Junta os Set-Cookie de uma resposta num header Cookie. */
export function cookiesFrom(res: Response, previous = ""): string {
  const jar = new Map<string, string>();
  for (const part of previous.split(/;\s*/).filter(Boolean)) {
    const [k, ...v] = part.split("=");
    if (k) jar.set(k, v.join("="));
  }
  for (const line of res.headers.getSetCookie()) {
    const [pair] = line.split(";");
    const [k, ...v] = (pair ?? "").split("=");
    if (!k) continue;
    if (/max-age=0/i.test(line)) jar.delete(k);
    else jar.set(k, v.join("="));
  }
  return [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
}

export const linkIn = (email: Email | undefined) => {
  const m = email?.text.match(/https?:\/\/\S+/);
  if (!m) throw new Error("e-mail sem link");
  return m[0];
};

/** Cadastra, confirma o e-mail e devolve o cookie de sessão. */
export async function signUpVerified(t: Awaited<ReturnType<typeof setup>>, email = "ana@exemplo.com") {
  const res = await t.req("/api/auth/sign-up/email", {
    method: "POST",
    json: { name: "Ana Souza", email, password: "senha-bem-forte-123" },
  });
  if (!res.ok) throw new Error(`cadastro falhou: ${res.status} ${await res.text()}`);
  const mail = t.outbox.filter((m) => m.to === email).at(-1);
  const url = new URL(linkIn(mail));
  const verify = await t.req(url.pathname + url.search, { redirect: "manual" });
  return cookiesFrom(verify);
}
