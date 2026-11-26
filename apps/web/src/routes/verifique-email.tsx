import { createFileRoute, Link } from "@tanstack/react-router";
import { MailCheck } from "lucide-react";
import { useState } from "react";
import { AuthLayout } from "@/components/auth-layout";
import { Alert, Button } from "@/components/ui";
import { authClient, authErrorMessage } from "@/lib/auth-client";

export const Route = createFileRoute("/verifique-email")({
  validateSearch: (s: Record<string, unknown>) => ({
    email: typeof s.email === "string" ? s.email : undefined,
  }),
  head: () => ({ meta: [{ title: "Confirme seu e-mail · Miu Controle" }] }),
  component: VerifiqueEmail,
});

function VerifiqueEmail() {
  const { email } = Route.useSearch();
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function resend() {
    if (!email) return;
    setStatus("sending");
    const { error } = await authClient.sendVerificationEmail({ email, callbackURL: "/inicio" });
    if (error) {
      setError(authErrorMessage(error));
      setStatus("error");
    } else setStatus("sent");
  }

  return (
    <AuthLayout
      title="Confirme seu e-mail"
      subtitle={
        <>
          Enviamos um link para <b className="text-fg">{email ?? "o seu e-mail"}</b>. Abra o e-mail e toque em
          "Confirmar e-mail" para entrar.
        </>
      }
    >
      <div className="flex items-center gap-3 rounded-card bg-surface p-4 text-sm text-fg-2 shadow-card">
        <MailCheck className="size-5 shrink-0 text-accent" aria-hidden />
        Não chegou? Confira a caixa de spam ou promoções. O link vale por 24 horas.
      </div>
      {status === "sent" ? <Alert tone="ok">Enviamos um novo link.</Alert> : null}
      {status === "error" && error ? <Alert>{error}</Alert> : null}
      {email ? (
        <Button onClick={resend} loading={status === "sending"} disabled={status === "sent"}>
          Reenviar link
        </Button>
      ) : null}
      <p className="text-center text-sm text-muted">
        E-mail errado?{" "}
        <Link to="/cadastro" className="font-medium text-accent hover:underline">
          Criar conta de novo
        </Link>
      </p>
    </AuthLayout>
  );
}
