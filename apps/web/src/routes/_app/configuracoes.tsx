import { formatBRL, parseBRL } from "@miu/core";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { LogOut, Monitor, Moon, Smartphone, Sun } from "lucide-react";
import { type FormEvent, useState } from "react";
import { AlertsCard, DeleteAccountCard } from "@/components/account-danger";
import { CategoriesManager } from "@/components/categories-manager";
import { Alert, Button, Card, Field, Input } from "@/components/ui";
import { authClient, authErrorMessage } from "@/lib/auth-client";
import { cn } from "@/lib/cn";
import { ApiRequestError, meQuery, updateMe } from "@/lib/me";
import { clearOfflineData } from "@/lib/offline";
import { getTheme, setTheme, type Theme } from "@/lib/theme";

export const Route = createFileRoute("/_app/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações · Miu Controle" }] }),
  component: Configuracoes,
});

function Configuracoes() {
  return (
    <div className="rise grid gap-4 lg:grid-cols-2">
      <Perfil />
      <Senha />
      <Aparencia />
      <AlertsCard />
      <CategoriesManager />
      <Sessoes />
      <Card className="flex flex-col gap-3 p-5">
        <h3 className="font-semibold">Sair</h3>
        <p className="text-sm text-muted">Encerra a sessão neste aparelho.</p>
        <SairButton />
      </Card>
      <DeleteAccountCard />
    </div>
  );
}

function Perfil() {
  const { data: me } = useSuspenseQuery(meQuery);
  const queryClient = useQueryClient();
  const [name, setName] = useState(me?.name ?? "");
  const [income, setIncome] = useState(
    me?.settings.monthlyIncomeCents != null
      ? formatBRL(me.settings.monthlyIncomeCents).replace("R$ ", "")
      : "",
  );
  const [incomeError, setIncomeError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: updateMe,
    onSuccess: (data) => queryClient.setQueryData(meQuery.queryKey, data),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const cents = income.trim() ? parseBRL(income) : null;
    if (income.trim() && (cents === null || cents < 0)) {
      setIncomeError("Digite um valor como 4.500,00.");
      return;
    }
    setIncomeError(null);
    save.mutate({ name: name.trim(), monthlyIncomeCents: cents });
  }

  return (
    <Card className="p-5">
      <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
        <h3 className="font-semibold">Perfil</h3>
        <Field label="Como quer ser chamado">
          {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />}
        </Field>
        <Field label="E-mail">{(p) => <Input {...p} value={me?.email ?? ""} disabled />}</Field>
        <Field
          label="Renda mensal aproximada"
          error={incomeError}
          hint="Opcional. Usada só para sugerir limites de orçamento."
        >
          {(p) => (
            <Input
              {...p}
              inputMode="decimal"
              placeholder="0,00"
              value={income}
              onChange={(e) => setIncome(e.target.value)}
              className="num"
            />
          )}
        </Field>
        {save.isError ? (
          <Alert>
            {save.error instanceof ApiRequestError ? save.error.message : "Não foi possível salvar."}
          </Alert>
        ) : null}
        {save.isSuccess ? <Alert tone="ok">Perfil salvo.</Alert> : null}
        <div>
          <Button type="submit" variant="primary" loading={save.isPending} disabled={!name.trim()}>
            Salvar
          </Button>
        </div>
      </form>
    </Card>
  );
}

function Senha() {
  const queryClient = useQueryClient();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [others, setOthers] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const change = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.changePassword({
        currentPassword: current,
        newPassword: next,
        revokeOtherSessions: others,
      });
      if (error) throw new Error(authErrorMessage(error) ?? "Não foi possível trocar a senha.");
    },
    onSuccess: () => {
      setCurrent("");
      setNext("");
      setConfirm("");
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["sessions"] });
    },
    onError: (e) => setError(e.message),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    change.reset();
    if (next.length < 10) return setError("A senha nova precisa ter pelo menos 10 caracteres.");
    if (next !== confirm) return setError("A confirmação não bate com a senha nova.");
    if (next === current) return setError("A senha nova precisa ser diferente da atual.");
    setError(null);
    change.mutate();
  }

  return (
    <Card className="p-5">
      <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
        <h3 className="font-semibold">Senha</h3>
        <Field label="Senha atual">
          {(p) => (
            <Input
              {...p}
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          )}
        </Field>
        <Field label="Senha nova" hint="Pelo menos 10 caracteres.">
          {(p) => (
            <Input
              {...p}
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
          )}
        </Field>
        <Field label="Repita a senha nova">
          {(p) => (
            <Input
              {...p}
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          )}
        </Field>
        <label className="flex items-center gap-2.5 text-sm text-fg-2">
          <input
            type="checkbox"
            checked={others}
            onChange={(e) => setOthers(e.target.checked)}
            className="size-[18px] accent-primary"
          />
          Sair dos outros aparelhos
        </label>
        {error ? <Alert>{error}</Alert> : null}
        {change.isSuccess ? (
          <Alert tone="ok">
            Senha trocada.{others ? " Os outros aparelhos precisam entrar de novo." : ""}
          </Alert>
        ) : null}
        <div>
          <Button
            type="submit"
            variant="primary"
            loading={change.isPending}
            disabled={!current || !next || !confirm}
          >
            Trocar senha
          </Button>
        </div>
      </form>
    </Card>
  );
}

const THEMES: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "system", label: "Sistema", icon: Monitor },
  { value: "light", label: "Claro", icon: Sun },
  { value: "dark", label: "Escuro", icon: Moon },
];

function Aparencia() {
  const [theme, set] = useState<Theme>(getTheme);
  return (
    <Card className="flex flex-col gap-4 p-5">
      <h3 className="font-semibold">Aparência</h3>
      <fieldset className="inline-flex w-fit gap-0.5 rounded-[11px] border border-line bg-surface-2 p-[3px]">
        <legend className="sr-only">Tema</legend>
        {THEMES.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            aria-pressed={theme === value}
            onClick={() => {
              setTheme(value);
              set(value);
            }}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium",
              theme === value ? "border-line bg-surface text-fg shadow-sm" : "border-transparent text-muted",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </button>
        ))}
      </fieldset>
      <p className="text-sm text-muted">"Sistema" acompanha o modo claro ou escuro do seu aparelho.</p>
    </Card>
  );
}

function deviceLabel(ua: string | null | undefined) {
  if (!ua) return "Aparelho desconhecido";
  const os = /iPhone|iPad/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Windows/.test(ua)
        ? "Windows"
        : /Mac OS/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "Outro";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
      ? "Chrome"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Safari\//.test(ua)
          ? "Safari"
          : "Navegador";
  return `${browser} · ${os}`;
}

const rel = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
function ago(date: Date | string) {
  const diff = (new Date(date).getTime() - Date.now()) / 1000;
  if (Math.abs(diff) < 3600) return rel.format(Math.round(diff / 60), "minute");
  if (Math.abs(diff) < 86400) return rel.format(Math.round(diff / 3600), "hour");
  return rel.format(Math.round(diff / 86400), "day");
}

function Sessoes() {
  const queryClient = useQueryClient();
  const current = authClient.useSession();
  const sessions = useQuery({
    queryKey: ["sessions"],
    queryFn: async () => {
      const { data, error } = await authClient.listSessions();
      if (error) throw error;
      return data;
    },
  });
  const revoke = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.revokeOtherSessions();
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sessions"] }),
  });
  const currentToken = current.data?.session.token;
  const list = [...(sessions.data ?? [])].sort(
    (a, b) => Number(b.token === currentToken) - Number(a.token === currentToken),
  );

  return (
    <Card>
      <div className="flex items-center justify-between gap-3 px-5 pt-4">
        <h3 className="font-semibold">Aparelhos conectados</h3>
        {list.length > 1 ? (
          <Button size="sm" variant="danger" loading={revoke.isPending} onClick={() => revoke.mutate()}>
            Sair dos outros
          </Button>
        ) : null}
      </div>
      <ul className="mt-2">
        {sessions.isPending ? <li className="px-5 py-4 text-sm text-muted">Carregando…</li> : null}
        {list.map((s) => (
          <li key={s.id} className="flex items-center gap-3 border-t border-line px-5 py-3 first:border-t-0">
            <span className="grid size-9 place-items-center rounded-[10px] bg-surface-2 text-muted">
              {/iPhone|Android/.test(s.userAgent ?? "") ? (
                <Smartphone className="size-[18px]" />
              ) : (
                <Monitor className="size-[18px]" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14.5px] font-medium">{deviceLabel(s.userAgent)}</span>
              <span className="text-[13px] text-muted">Ativo {ago(s.updatedAt)}</span>
            </span>
            {s.token === currentToken ? (
              <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">
                Este aparelho
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function SairButton() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  return (
    <div>
      <Button
        loading={loading}
        onClick={async () => {
          setLoading(true);
          await authClient.signOut();
          queryClient.clear();
          clearOfflineData();
          navigate({ to: "/entrar" });
        }}
      >
        <LogOut className="size-4" aria-hidden /> Sair
      </Button>
    </div>
  );
}
