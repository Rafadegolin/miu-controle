import { createFileRoute, Link } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { AuthLayout } from "@/components/auth-layout";
import { captchaHeaders, Turnstile } from "@/components/turnstile";
import { Alert, Button, Field, Input } from "@/components/ui";
import { authClient, authErrorMessage } from "@/lib/auth-client";

export const Route = createFileRoute("/recuperar-senha")({
  head: () => ({ meta: [{ title: "Recuperar senha · Miu Controle" }] }),
  component: RecuperarSenha,
});

function RecuperarSenha() {
  const [email, setEmail] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError("Digite um e-mail válido, como voce@exemplo.com.");
      return;
    }
    setLoading(true);
    const { error } = await authClient.requestPasswordReset(
      { email: email.trim(), redirectTo: "/redefinir-senha" },
      { headers: captchaHeaders(token) },
    );
    setLoading(false);
    setResetKey((k) => k + 1);
    if (error) setError(authErrorMessage(error));
    else setSent(true);
  }

  return (
    <AuthLayout title="Recuperar senha" subtitle="Enviamos um link para você criar uma senha nova.">
      {sent ? (
        <Alert tone="ok">
          Se existir uma conta com <b>{email.trim()}</b>, o link chega em alguns minutos. Ele vale por 1 hora.
        </Alert>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
          <Field label="E-mail da conta">
            {(p) => (
              <Input
                {...p}
                type="email"
                autoComplete="email"
                placeholder="voce@exemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            )}
          </Field>
          <Turnstile onToken={setToken} resetKey={resetKey} />
          {error ? <Alert>{error}</Alert> : null}
          <Button type="submit" variant="primary" size="lg" loading={loading}>
            Enviar link
          </Button>
        </form>
      )}
      <p className="text-center text-sm text-muted">
        <Link to="/entrar" className="font-medium text-accent hover:underline">
          Voltar para o login
        </Link>
      </p>
    </AuthLayout>
  );
}
