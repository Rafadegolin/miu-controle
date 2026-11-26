import { type Db, schema } from "@miu/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { captcha } from "better-auth/plugins";
import type { Bindings } from "../env";
import * as templates from "./email-templates";
import type { Mailer } from "./mailer";
import { hashPassword, verifyPassword } from "./password";
import { seedDefaultCategories } from "./user-data";

type Deps = {
  env: Bindings;
  db: Db;
  mailer: Mailer;
  /** Envia e-mails depois da resposta, para não atrasar a request (nem vazar timing). */
  defer: (p: Promise<unknown>) => void;
};

const DAY = 60 * 60 * 24;

export function createAuth({ env, db, mailer, defer }: Deps) {
  const send = (email: Parameters<Mailer["send"]>[0]) =>
    defer(mailer.send(email).catch((err) => console.error("email_falhou", { to: email.to, err })));

  return betterAuth({
    appName: "Miu Controle",
    baseURL: env.APP_URL,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.APP_URL],
    database: drizzleAdapter(db, { provider: "pg", schema }),

    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: 60 * 60,
      password: { hash: hashPassword, verify: verifyPassword },
      sendResetPassword: async ({ user, url }) => send(templates.resetPassword(user.email, url)),
    },

    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      expiresIn: DAY,
      sendVerificationEmail: async ({ user, url }) => send(templates.verifyEmail(user.email, user.name, url)),
    },

    socialProviders:
      env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } }
        : {},

    databaseHooks: {
      user: {
        create: {
          // Todo usuário novo já nasce com as categorias padrão.
          after: async (user) => {
            await seedDefaultCategories(db, user.id);
          },
        },
      },
    },

    session: {
      expiresIn: 30 * DAY,
      updateAge: DAY,
      // Evita ir ao banco em toda request: a sessão fica num cookie assinado por 5 minutos.
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },

    advanced: {
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
      useSecureCookies: env.APP_URL.startsWith("https://"),
      database: { generateId: () => crypto.randomUUID() },
    },

    // O rate limit de verdade é o binding da Cloudflare (middleware/rate-limit.ts).
    rateLimit: { enabled: false },

    plugins: env.TURNSTILE_SECRET
      ? [captcha({ provider: "cloudflare-turnstile", secretKey: env.TURNSTILE_SECRET })]
      : [],
  });
}

export type Auth = ReturnType<typeof createAuth>;
