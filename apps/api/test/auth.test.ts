import { eq, schema } from "@miu/db";
import { afterEach, describe, expect, it } from "vitest";
import { cookiesFrom, linkIn, setup, signUpVerified } from "./harness";

let t: Awaited<ReturnType<typeof setup>>;
afterEach(async () => t?.close());

const PASS = "senha-bem-forte-123";

describe("cadastro e login", () => {
  it("exige e-mail confirmado antes de entrar", async () => {
    t = await setup();
    const res = await t.req("/api/auth/sign-up/email", {
      method: "POST",
      json: { name: "Ana", email: "ana@exemplo.com", password: PASS },
    });
    expect(res.status).toBe(200);
    expect(t.outbox).toHaveLength(1);
    expect(t.outbox[0]?.subject).toContain("Confirme seu e-mail");

    const login = await t.req("/api/auth/sign-in/email", {
      method: "POST",
      json: { email: "ana@exemplo.com", password: PASS },
    });
    expect(login.status).toBe(403);
  });

  it("confirma o e-mail pelo link, cria sessão e libera /api/me", async () => {
    t = await setup();
    const cookie = await signUpVerified(t);
    expect(cookie).toContain("better-auth.session_token");

    const me = await t.req("/api/me", { cookie });
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({
      name: "Ana Souza",
      email: "ana@exemplo.com",
      emailVerified: true,
      settings: { timezone: "America/Sao_Paulo", currency: "BRL", onboardingCompleted: false },
    });
  });

  it("guarda a senha com PBKDF2, nunca em texto", async () => {
    t = await setup();
    await signUpVerified(t);
    const rows = await t.db.query.account.findMany();
    expect(rows[0]?.password).toMatch(/^pbkdf2_sha256\$100000\$/);
    expect(rows[0]?.password).not.toContain(PASS);
  });

  it("recusa senha curta e senha errada", async () => {
    t = await setup();
    const curta = await t.req("/api/auth/sign-up/email", {
      method: "POST",
      json: { name: "Ana", email: "ana@exemplo.com", password: "123" },
    });
    expect(curta.status).toBe(400);

    await signUpVerified(t, "bia@exemplo.com");
    const errada = await t.req("/api/auth/sign-in/email", {
      method: "POST",
      json: { email: "bia@exemplo.com", password: "senha-errada-000" },
    });
    expect(errada.status).toBe(401);
  });

  it("redefine a senha pelo link do e-mail e derruba as sessões antigas", async () => {
    t = await setup();
    const oldCookie = await signUpVerified(t);

    const pedido = await t.req("/api/auth/request-password-reset", {
      method: "POST",
      json: { email: "ana@exemplo.com", redirectTo: "/redefinir-senha" },
    });
    expect(pedido.status).toBe(200);
    const mail = t.outbox.at(-1);
    expect(mail?.subject).toContain("Redefinir");

    // o link passa pela API e redireciona para a tela do app com ?token=
    const link = new URL(linkIn(mail));
    const redirect = await t.req(link.pathname + link.search, { redirect: "manual" });
    const token = new URL(redirect.headers.get("location") ?? "", "http://x").searchParams.get("token");
    expect(token).toBeTruthy();

    const reset = await t.req("/api/auth/reset-password", {
      method: "POST",
      json: { token, newPassword: "outra-senha-forte-456" },
    });
    expect(reset.status).toBe(200);

    const velha = await t.req("/api/me", {
      cookie: oldCookie.replace(/better-auth\.session_data=[^;]*;?\s*/, ""),
    });
    expect(velha.status).toBe(401);

    const login = await t.req("/api/auth/sign-in/email", {
      method: "POST",
      json: { email: "ana@exemplo.com", password: "outra-senha-forte-456" },
    });
    expect(login.status).toBe(200);
    expect(cookiesFrom(login)).toContain("session_token");
  });
});

describe("trocar senha logado", () => {
  it("exige a senha atual, grava com PBKDF2 e pode derrubar os outros aparelhos", async () => {
    t = await setup();
    const aqui = await signUpVerified(t);
    const outro = cookiesFrom(
      await t.req("/api/auth/sign-in/email", {
        method: "POST",
        json: { email: "ana@exemplo.com", password: "senha-bem-forte-123" },
      }),
    );
    const change = (cookie: string, body: object) =>
      t.req("/api/auth/change-password", { method: "POST", cookie, json: body });

    // senha atual errada e senha nova curta são recusadas
    expect(
      (await change(aqui, { currentPassword: "errada-errada-1", newPassword: "nova-senha-forte-789" }))
        .status,
    ).toBe(400);
    expect(
      (await change(aqui, { currentPassword: "senha-bem-forte-123", newPassword: "curta" })).status,
    ).toBe(400);
    // sem sessão, nada feito
    expect(
      (await change("", { currentPassword: "senha-bem-forte-123", newPassword: "nova-senha-forte-789" }))
        .status,
    ).toBe(401);

    const ok = await change(aqui, {
      currentPassword: "senha-bem-forte-123",
      newPassword: "nova-senha-forte-789",
      revokeOtherSessions: true,
    });
    expect(ok.status).toBe(200);
    const aquiNovo = cookiesFrom(ok, aqui);

    const [account] = await t.db
      .select()
      .from(schema.account)
      .where(eq(schema.account.providerId, "credential"));
    expect(account?.password).toMatch(/^pbkdf2_sha256\$/);

    expect((await t.req("/api/me", { cookie: outro })).status).toBe(401);
    expect((await t.req("/api/me", { cookie: aquiNovo })).status).toBe(200);

    const velha = await t.req("/api/auth/sign-in/email", {
      method: "POST",
      json: { email: "ana@exemplo.com", password: "senha-bem-forte-123" },
    });
    expect(velha.status).toBe(401);
    const nova = await t.req("/api/auth/sign-in/email", {
      method: "POST",
      json: { email: "ana@exemplo.com", password: "nova-senha-forte-789" },
    });
    expect(nova.status).toBe(200);
  });
});

describe("proteções", () => {
  it("/api/me sem sessão devolve 401 no formato padrão", async () => {
    t = await setup();
    const res = await t.req("/api/me");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      erro: "nao_autenticado",
      mensagem: "Entre na sua conta para continuar.",
    });
  });

  it("aplica o rate limit nas rotas de login", async () => {
    let calls = 0;
    t = await setup({
      AUTH_LIMITER: {
        limit: async () => ({ success: ++calls <= 2 }),
      },
    });
    const tentar = () =>
      t.req("/api/auth/sign-in/email", { method: "POST", json: { email: "x@exemplo.com", password: PASS } });
    expect((await tentar()).status).toBe(401);
    expect((await tentar()).status).toBe(401);
    const bloqueada = await tentar();
    expect(bloqueada.status).toBe(429);
    expect(await bloqueada.json()).toMatchObject({ erro: "muitas_tentativas" });
  });

  it("exige Turnstile quando configurado", async () => {
    t = await setup({ TURNSTILE_SECRET: "1x0000000000000000000000000000000AA" });
    const res = await t.req("/api/auth/sign-up/email", {
      method: "POST",
      json: { name: "Ana", email: "ana@exemplo.com", password: PASS },
    });
    expect(res.status).toBe(400);
  });
});

describe("perfil", () => {
  it("atualiza nome e renda e conclui o onboarding", async () => {
    t = await setup();
    const cookie = await signUpVerified(t);

    const patch = await t.req("/api/me", {
      method: "PATCH",
      cookie,
      json: { name: "Ana S.", monthlyIncomeCents: 780000 },
    });
    expect(patch.status).toBe(200);
    expect(await patch.json()).toMatchObject({ name: "Ana S.", settings: { monthlyIncomeCents: 780000 } });

    const done = await t.req("/api/me/onboarding/complete", { method: "POST", cookie });
    expect(await done.json()).toMatchObject({ settings: { onboardingCompleted: true } });
  });

  it("rejeita campos desconhecidos e valores inválidos", async () => {
    t = await setup();
    const cookie = await signUpVerified(t);
    const res = await t.req("/api/me", {
      method: "PATCH",
      cookie,
      json: { monthlyIncomeCents: -5, admin: true },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ erro: "dados_invalidos" });
  });
});
