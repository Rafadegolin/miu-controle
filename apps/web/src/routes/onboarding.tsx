import { parseBRL } from "@miu/core";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { Chip } from "@/components/controls";
import { Alert, Button, Field, Input, Logo } from "@/components/ui";
import { cn } from "@/lib/cn";
import { accountsQuery, archiveCategory, categoriesQuery, createAccount } from "@/lib/finance";
import { requireMe } from "@/lib/guards";
import { ApiRequestError } from "@/lib/http";
import { completeOnboarding, meQuery, updateMe } from "@/lib/me";

export const Route = createFileRoute("/onboarding")({
  beforeLoad: async ({ context }) => {
    const me = await requireMe(context.queryClient, { allowOnboarding: true });
    if (me.settings.onboardingCompleted) throw redirect({ to: "/inicio" });
  },
  head: () => ({ meta: [{ title: "Bem-vindo · Miu Controle" }] }),
  component: Onboarding,
});

const STEPS = 3;

function Onboarding() {
  const { data: me } = useSuspenseQuery(meQuery);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const accounts = useQuery(accountsQuery);
  const categories = useQuery(categoriesQuery);

  const [step, setStep] = useState(1);
  const [name, setName] = useState(me?.name ?? "");
  const [income, setIncome] = useState("");
  const [accName, setAccName] = useState("Conta principal");
  const [balance, setBalance] = useState("");
  const [unselected, setUnselected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const hasAccount = (accounts.data ?? []).some((a) => !a.archived);

  async function run(fn: () => Promise<void>) {
    setError(null);
    setLoading(true);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Não foi possível salvar. Tente de novo.");
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (step === 1) {
      const cents = income.trim() ? parseBRL(income) : null;
      if (!name.trim()) return setError("Diga como quer ser chamado.");
      if (income.trim() && (cents === null || cents < 0))
        return setError("Digite a renda como 4.500,00, ou deixe em branco.");
      return run(async () => {
        queryClient.setQueryData(
          meQuery.queryKey,
          await updateMe({ name: name.trim(), monthlyIncomeCents: cents }),
        );
        setStep(2);
      });
    }
    if (step === 2) {
      if (hasAccount) return setStep(3);
      const cents = balance.trim() ? parseBRL(balance) : 0;
      if (!accName.trim()) return setError("Dê um nome para a conta.");
      if (cents === null) return setError("Digite o saldo como 1.234,56.");
      return run(async () => {
        await createAccount({ name: accName.trim(), kind: "checking", initialBalanceCents: cents });
        await queryClient.invalidateQueries({ queryKey: accountsQuery.queryKey });
        setStep(3);
      });
    }
    return run(async () => {
      await Promise.all([...unselected].map((id) => archiveCategory(id, true)));
      await queryClient.invalidateQueries({ queryKey: categoriesQuery.queryKey });
      queryClient.setQueryData(meQuery.queryKey, await completeOnboarding());
      navigate({ to: "/inicio" });
    });
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-[560px] flex-col gap-6 px-4 pt-[calc(40px+env(safe-area-inset-top))] pb-10">
      <span className="flex items-center gap-2.5 font-semibold tracking-tight">
        <Logo /> Miu Controle
      </span>
      <div className="flex gap-1.5" aria-hidden>
        {[1, 2, 3].map((n) => (
          <span key={n} className={cn("h-1 flex-1 rounded", n <= step ? "bg-primary" : "bg-surface-2")} />
        ))}
      </div>

      <form className="flex flex-col gap-5" onSubmit={onSubmit} noValidate>
        <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted">
          Passo {step} de {STEPS}
        </p>

        {step === 1 ? (
          <>
            <Heading title="Como quer ser chamado?" sub="Isso aparece só para você." />
            <Field label="Nome">
              {(p) => (
                <Input {...p} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
              )}
            </Field>
            <Field
              label="Renda mensal aproximada (opcional)"
              hint="Usada só para sugerir limites de orçamento."
            >
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
          </>
        ) : null}

        {step === 2 ? (
          <>
            <Heading
              title="Qual é a sua conta principal?"
              sub="Onde seu salário cai. Outras contas e cartões você adiciona depois."
            />
            {hasAccount ? (
              <Alert tone="ok">Você já tem uma conta cadastrada. Pode seguir.</Alert>
            ) : (
              <>
                <Field label="Nome da conta">
                  {(p) => (
                    <Input
                      {...p}
                      value={accName}
                      maxLength={60}
                      onChange={(e) => setAccName(e.target.value)}
                    />
                  )}
                </Field>
                <Field
                  label="Saldo de hoje"
                  hint="Olhe no app do banco. A partir daqui o Miu calcula sozinho."
                >
                  {(p) => (
                    <Input
                      {...p}
                      inputMode="decimal"
                      placeholder="0,00"
                      className="num"
                      value={balance}
                      onChange={(e) => setBalance(e.target.value)}
                    />
                  )}
                </Field>
              </>
            )}
          </>
        ) : null}

        {step === 3 ? (
          <>
            <Heading
              title="Estas categorias servem?"
              sub="Desmarque as que não fazem sentido. Dá para criar e editar quando quiser, em Configurações."
            />
            {(["expense", "income"] as const).map((kind) => (
              <div key={kind} className="flex flex-col gap-2">
                <span className="text-[13px] font-medium text-muted">
                  {kind === "expense" ? "Despesas" : "Receitas"}
                </span>
                <div className="flex flex-wrap gap-2">
                  {(categories.data ?? [])
                    .filter((c) => c.kind === kind && !c.archived)
                    .map((c) => (
                      <Chip
                        key={c.id}
                        color={c.color}
                        pressed={!unselected.has(c.id)}
                        onClick={() =>
                          setUnselected((s) => {
                            const n = new Set(s);
                            if (n.has(c.id)) n.delete(c.id);
                            else n.add(c.id);
                            return n;
                          })
                        }
                      >
                        {c.name}
                      </Chip>
                    ))}
                </div>
              </div>
            ))}
          </>
        ) : null}

        {error ? <Alert>{error}</Alert> : null}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => setStep((s) => s - 1)}
            className={step === 1 ? "invisible" : ""}
          >
            Voltar
          </Button>
          <Button type="submit" variant="primary" size="lg" loading={loading}>
            {step === STEPS ? "Começar a usar" : "Continuar"}
          </Button>
        </div>
      </form>
    </main>
  );
}

function Heading({ title, sub }: { title: string; sub: string }) {
  return (
    <div>
      <h1 className="text-[30px] font-semibold leading-tight tracking-[-0.035em]">{title}</h1>
      <p className="mt-2 text-muted">{sub}</p>
    </div>
  );
}
