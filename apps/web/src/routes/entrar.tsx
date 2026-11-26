import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { AuthLayout } from "@/components/auth-layout";
import { captchaHeaders, Turnstile } from "@/components/turnstile";
import { Alert, Button, Field, Input } from "@/components/ui";
import { authClient, authErrorMessage } from "@/lib/auth-client";
import { guestOnly } from "@/lib/guards";
import { meQuery } from "@/lib/me";

export const Route = createFileRoute("/entrar")({
  beforeLoad: ({ context }) => guestOnly(context.queryClient),
  head: () => ({ meta: [{ title: "Entrar · Miu Controle" }] }),
  component: Entrar,
});

function Entrar() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await authClient.signIn.email(
      { email: email.trim(), password, callbackURL: "/" },
      { headers: captchaHeaders(token) },
    );
    setLoading(false);
    setResetKey((k) => k + 1);
    if (error) {
      if (error.code === "EMAIL_NOT_VERIFIED") {
        navigate({ to: "/verifique-email", search: { email: email.trim() } });
        return;
      }
      setError(authErrorMessage(error));
      return;
    }
    await queryClient.invalidateQueries({ queryKey: meQuery.queryKey });
    navigate({ to: "/" });
  }

  return (
    <AuthLayout title="Bem-vindo de volta" subtitle="Entre para ver como está o seu mês.">
      <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
        <Field label="E-mail">
          {(p) => (
            <Input
              {...p}
              type="email"
              autoComplete="email"
              placeholder="voce@exemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          )}
        </Field>
        <Field
          label="Senha"
          aside={
            <Link to="/recuperar-senha" className="text-[13px] font-medium text-accent hover:underline">
              Esqueci a senha
            </Link>
          }
        >
          {(p) => (
            <Input
              {...p}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          )}
        </Field>
        <Turnstile onToken={setToken} resetKey={resetKey} />
        {error ? <Alert>{error}</Alert> : null}
        <Button type="submit" variant="primary" size="lg" loading={loading}>
          Entrar
        </Button>
      </form>
      <p className="text-center text-sm text-muted">
        Ainda não tem conta?{" "}
        <Link to="/cadastro" className="font-medium text-accent hover:underline">
          Criar conta
        </Link>
      </p>
    </AuthLayout>
  );
}
