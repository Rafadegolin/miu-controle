import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { AuthLayout } from "@/components/auth-layout";
import { captchaHeaders, Turnstile } from "@/components/turnstile";
import { Alert, Button, Field, Input } from "@/components/ui";
import { authClient, authErrorMessage } from "@/lib/auth-client";
import { guestOnly } from "@/lib/guards";

export const Route = createFileRoute("/cadastro")({
  beforeLoad: ({ context }) => guestOnly(context.queryClient),
  head: () => ({ meta: [{ title: "Criar conta · Miu Controle" }] }),
  component: Cadastro,
});

function Cadastro() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [errors, setErrors] = useState<Partial<Record<keyof typeof form, string>>>({});
  const [token, setToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  function validate() {
    const next: typeof errors = {};
    if (!form.name.trim()) next.name = "Diga como quer ser chamado.";
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim()))
      next.email = "Digite um e-mail válido, como voce@exemplo.com.";
    if (form.password.length < 10) next.password = "A senha precisa ter pelo menos 10 caracteres.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!validate()) return;
    setLoading(true);
    const email = form.email.trim();
    const { error } = await authClient.signUp.email(
      { name: form.name.trim(), email, password: form.password, callbackURL: "/" },
      { headers: captchaHeaders(token) },
    );
    setLoading(false);
    setResetKey((k) => k + 1);
    if (error) {
      setError(authErrorMessage(error));
      return;
    }
    navigate({ to: "/verifique-email", search: { email } });
  }

  return (
    <AuthLayout title="Crie sua conta" subtitle="Grátis. Sem cartão e sem conectar banco.">
      <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
        <Field label="Nome" error={errors.name}>
          {(p) => (
            <Input
              {...p}
              autoComplete="name"
              placeholder="Como quer ser chamado"
              value={form.name}
              onChange={set("name")}
            />
          )}
        </Field>
        <Field label="E-mail" error={errors.email}>
          {(p) => (
            <Input
              {...p}
              type="email"
              autoComplete="email"
              placeholder="voce@exemplo.com"
              value={form.email}
              onChange={set("email")}
            />
          )}
        </Field>
        <Field
          label="Senha"
          error={errors.password}
          hint="Pelo menos 10 caracteres. Uma frase curta é fácil de lembrar."
        >
          {(p) => (
            <Input
              {...p}
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={set("password")}
            />
          )}
        </Field>
        <Turnstile onToken={setToken} resetKey={resetKey} />
        {error ? <Alert>{error}</Alert> : null}
        <Button type="submit" variant="primary" size="lg" loading={loading}>
          Criar conta
        </Button>
      </form>
      <p className="text-center text-sm text-muted">
        Já tem conta?{" "}
        <Link to="/entrar" className="font-medium text-accent hover:underline">
          Entrar
        </Link>
      </p>
    </AuthLayout>
  );
}
