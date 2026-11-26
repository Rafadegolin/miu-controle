import { parseBRL } from "@miu/core";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { Alert, Button, Field, Input, Logo } from "@/components/ui";
import { requireMe } from "@/lib/guards";
import { ApiRequestError, completeOnboarding, meQuery, updateMe } from "@/lib/me";

export const Route = createFileRoute("/onboarding")({
  beforeLoad: async ({ context }) => {
    const me = await requireMe(context.queryClient, { allowOnboarding: true });
    if (me.settings.onboardingCompleted) throw redirect({ to: "/" });
  },
  head: () => ({ meta: [{ title: "Bem-vindo · Miu Controle" }] }),
  component: Onboarding,
});

/*
 * Fase 1: um passo (nome e renda). Na Fase 2 entram "conta principal" e "categorias".
 */
function Onboarding() {
  const { data: me } = useSuspenseQuery(meQuery);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState(me?.name ?? "");
  const [income, setIncome] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const cents = income.trim() ? parseBRL(income) : null;
    if (!name.trim()) return setError("Diga como quer ser chamado.");
    if (income.trim() && (cents === null || cents < 0))
      return setError("Digite a renda como 4.500,00, ou deixe em branco.");
    setLoading(true);
    try {
      await updateMe({ name: name.trim(), monthlyIncomeCents: cents });
      const updated = await completeOnboarding();
      queryClient.setQueryData(meQuery.queryKey, updated);
      navigate({ to: "/" });
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Não foi possível salvar. Tente de novo.");
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-[560px] flex-col gap-6 px-4 py-10">
      <span className="flex items-center gap-2.5 font-semibold tracking-tight">
        <Logo /> Miu Controle
      </span>
      <div className="flex gap-1.5" aria-hidden>
        <span className="h-1 flex-1 rounded bg-accent-fill" />
      </div>
      <div>
        <h1 className="text-[30px] font-semibold leading-tight tracking-[-0.035em]">
          Como quer ser chamado?
        </h1>
        <p className="mt-2 text-muted">Isso aparece só para você.</p>
      </div>
      <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
        <Field label="Nome">
          {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />}
        </Field>
        <Field label="Renda mensal aproximada (opcional)" hint="Usada só para sugerir limites de orçamento.">
          {(p) => (
            <Input
              {...p}
              inputMode="decimal"
              placeholder="0,00"
              className="num"
              value={income}
              onChange={(e) => setIncome(e.target.value)}
            />
          )}
        </Field>
        {error ? <Alert>{error}</Alert> : null}
        <div className="flex justify-end">
          <Button type="submit" variant="primary" size="lg" loading={loading}>
            Começar a usar
          </Button>
        </div>
      </form>
    </main>
  );
}
