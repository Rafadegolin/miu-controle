import type { Db } from "@miu/db";
import type { Auth } from "./lib/auth";
import type { PushSender } from "./lib/web-push";

/*
 * Tipos estruturais (sem depender dos globais do @cloudflare/workers-types) para que o
 * frontend consiga importar `AppType` de "@miu/api/client" sem puxar os tipos do Worker.
 */
export type Bindings = {
  HYPERDRIVE?: { connectionString: string };
  ASSETS?: { fetch: (input: Request | string, init?: RequestInit) => Promise<Response> };
  CF_VERSION_METADATA?: { id: string; tag: string; timestamp: string };
  /** Binding de Rate Limiting da Cloudflare (grátis). */
  AUTH_LIMITER?: { limit: (opts: { key: string }) => Promise<{ success: boolean }> };

  APP_ENV: string;
  /** URL pública do app (ex.: https://miucontrole.com.br). Base dos links de e-mail. */
  APP_URL: string;
  BETTER_AUTH_SECRET: string;
  EMAIL_FROM?: string;

  // Opcionais: sem eles o recurso fica desligado (útil em dev e testes).
  TURNSTILE_SECRET?: string;
  RESEND_API_KEY?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  /** Web Push: chave pública (var no wrangler.jsonc) e privada em JWK (secret). */
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
};

export type SessionUser = { id: string; email: string; name: string; emailVerified: boolean };

export type Variables = {
  /** Cliente Drizzle criado sob demanda por request (ver middleware/context.ts). */
  db: () => Db;
  /** Instância do Better Auth da request. */
  auth: () => Auth;
  /** Envio de push; null quando as chaves VAPID não estão configuradas. */
  push: () => PushSender | null;
  /** Preenchido por `requireUser`. */
  user: SessionUser;
};

export type App = { Bindings: Bindings; Variables: Variables };
