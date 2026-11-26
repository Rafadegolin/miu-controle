import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { AuthLayout } from "@/components/auth-layout";
import { Alert, Button, Field, Input } from "@/components/ui";
import { authClient, authErrorMessage } from "@/lib/auth-client";

export const Route = createFileRoute("/redefinir-senha")({
  validateSearch: (s: Record<string, unknown>) => ({
    token: typeof s.token === "string" ? s.token : undefined,
    error: typeof s.error === "string" ? s.error : undefined,
  }),
  head: () => ({ meta: [{ title: "Nova senha · Miu Controle" }] }),
  component: RedefinirSenha,
});

function RedefinirSenha() {
  const { token, error: linkError } = Route.useSearch();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 10) {
      setError("A senha precisa ter pelo menos 10 caracteres.");
      return;
    }
    if (!token) return;
    setLoading(true);
    const { error } = await authClient.resetPassword({ newPassword: password, token });
    setLoading(false);
    if (error) setError(authErrorMessage(error));
    else setDone(true);
  }

  if (!token || linkError) {
    return (
      <AuthLayout title="Link inválido" subtitle="Este link expirou ou já foi usado.">
        <Button variant="primary" size="lg" onClick={() => navigate({ to: "/recuperar-senha" })}>
          Pedir um link novo
        </Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Crie uma senha nova" subtitle="Por segurança, você vai sair de todos os aparelhos.">
      {done ? (
        <>
          <Alert tone="ok">Senha alterada. Entre com a senha nova.</Alert>
          <Link
            to="/entrar"
            className="inline-flex h-12 items-center justify-center rounded-xl bg-accent-fill font-medium text-on-accent"
          >
            Entrar
          </Link>
        </>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
          <Field label="Nova senha" hint="Pelo menos 10 caracteres.">
            {(p) => (
              <Input
                {...p}
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            )}
          </Field>
          {error ? <Alert>{error}</Alert> : null}
          <Button type="submit" variant="primary" size="lg" loading={loading}>
            Salvar senha nova
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
