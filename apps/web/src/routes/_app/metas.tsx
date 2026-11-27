import { addMonths, formatBRL, parseBRL, todayIn } from "@miu/core";
import { type Goal, PALETTE } from "@miu/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Minus, PiggyBank, Plus, Target, Trash2, TrendingUp } from "lucide-react";
import { useState } from "react";
import { AnimatedNumber } from "@/components/animated-number";
import { Sheet } from "@/components/sheet";
import { CardsSkeleton } from "@/components/skeletons";
import { toast } from "@/components/toast";
import { Alert, Button, Card, Field, Input } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  accountsQuery,
  adjustBalance,
  contribute,
  convertGoal,
  createGoal,
  deleteContribution,
  deleteGoal,
  goalHistoryQuery,
  goalsQuery,
  invalidateMoney,
  moveBox,
  toggleArchiveGoal,
  updateAccount,
  updateGoal,
} from "@/lib/finance";
import { dayShort, money, monthShort } from "@/lib/format";
import { ApiRequestError } from "@/lib/http";
import { awaitData } from "@/lib/loaders";
import { meQuery } from "@/lib/me";

export const Route = createFileRoute("/_app/metas")({
  loader: ({ context }) => awaitData([context.queryClient.ensureQueryData(goalsQuery)]),
  head: () => ({ meta: [{ title: "Metas · Miu Controle" }] }),
  component: Metas,
  pendingComponent: CardsSkeleton,
});

function Metas() {
  const { data: goals = [], isPending } = useQuery(goalsQuery);
  const [sheet, setSheet] = useState<{ open: boolean; goal: Goal | null }>({ open: false, goal: null });
  const active = goals.filter((g) => !g.archived);
  const archived = goals.filter((g) => g.archived);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <p className="max-w-xl text-muted">
          Cada meta pode ser uma caixinha, como a do seu banco: ao guardar, o dinheiro sai de uma conta e
          rende pelo CDI. Ou só acompanhe quanto já separou para o objetivo.
        </p>
        <Button variant="primary" onClick={() => setSheet({ open: true, goal: null })}>
          <Plus className="size-4" aria-hidden /> Nova meta
        </Button>
      </div>

      {isPending ? <Card className="h-40 skeleton" /> : null}
      {!isPending && active.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <span className="grid size-11 place-items-center rounded-xl bg-accent-soft text-accent">
            <Target className="size-5" aria-hidden />
          </span>
          <h3 className="text-lg font-semibold">Para o que você está juntando?</h3>
          <p className="max-w-md text-muted">
            Reserva de emergência, uma viagem, a troca do carro. Diga quanto e até quando: o Miu calcula
            quanto guardar por mês.
          </p>
          <Button variant="primary" onClick={() => setSheet({ open: true, goal: null })}>
            Criar meta
          </Button>
        </Card>
      ) : null}

      <div className="rise grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {active.map((g) => (
          <GoalCard key={g.id} goal={g} onEdit={() => setSheet({ open: true, goal: g })} />
        ))}
      </div>

      {archived.length ? (
        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-muted">Arquivadas</h3>
          <div className="grid gap-4 opacity-70 sm:grid-cols-2 lg:grid-cols-3">
            {archived.map((g) => (
              <GoalCard key={g.id} goal={g} onEdit={() => setSheet({ open: true, goal: g })} />
            ))}
          </div>
        </section>
      ) : null}

      <Sheet
        open={sheet.open}
        onClose={() => setSheet((s) => ({ ...s, open: false }))}
        title={sheet.goal ? "Editar meta" : "Nova meta"}
      >
        <GoalForm goal={sheet.goal} onDone={() => setSheet((s) => ({ ...s, open: false }))} />
      </Sheet>
    </>
  );
}

function GoalCard({ goal: g, onEdit }: { goal: Goal; onEdit: () => void }) {
  const queryClient = useQueryClient();
  const { data: me } = useQuery(meQuery);
  const today = todayIn(me?.settings.timezone);
  const [mode, setMode] = useState<"in" | "out" | null>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Caixinha: conta de onde sai (guardar) ou para onde volta (resgatar).
  const { data: accounts = [] } = useQuery(accountsQuery);
  const others = accounts.filter((a) => !a.card && !a.archived && a.id !== g.box?.accountId);
  const [from, setFrom] = useState("");
  const fromId = from || others[0]?.id || "";
  const pct = Math.min(1, g.progress);
  const done = g.savedCents >= g.targetCents;

  const save = useMutation({
    mutationFn: (cents: number) =>
      g.box
        ? moveBox(g.id, {
            direction: mode === "out" ? "out" : "in",
            amountCents: cents,
            accountId: fromId,
            date: today,
          })
        : contribute(g.id, mode === "out" ? -cents : cents, today),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["goals"] }),
        invalidateMoney(queryClient),
      ]);
      toast(
        g.box
          ? mode === "out"
            ? "Resgatado da caixinha"
            : "Guardado na caixinha"
          : mode === "out"
            ? "Retirada registrada"
            : "Aporte registrado",
      );
      setMode(null);
      setValue("");
    },
    onError: (e) => setError(e instanceof ApiRequestError ? e.message : "Não foi possível salvar."),
  });

  let pace: string;
  if (done) pace = "Meta alcançada.";
  else if (g.monthlyNeededCents === null) pace = "Sem data: guarde no seu ritmo.";
  else if (g.targetDate && g.targetDate < today)
    pace = `A data passou. Faltam ${money(g.targetCents - g.savedCents)}.`;
  else
    pace = `Guardando ${money(g.monthlyNeededCents)} por mês você chega lá${g.targetDate ? ` em ${monthShort(g.targetDate.slice(0, 7))}` : ""}.`;
  const behind =
    !done &&
    g.monthlyNeededCents !== null &&
    g.recentMonthlyCents > 0 &&
    g.recentMonthlyCents < g.monthlyNeededCents;

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-center gap-3">
        <span
          className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-[color-mix(in_srgb,var(--c)_15%,transparent)] text-(--c)"
          style={{ "--c": g.color } as React.CSSProperties}
          aria-hidden
        >
          <Target className="size-[18px]" />
        </span>
        <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-left">
          <span className="block truncate font-semibold">{g.name}</span>
          <span className="text-[13px] text-muted">
            {g.targetDate ? `até ${monthShort(g.targetDate.slice(0, 7))}` : "sem data"}
            {g.box
              ? ` · caixinha${g.box.cdiPercent ? ` ${(g.box.cdiPercent / 100).toLocaleString("pt-BR")}% do CDI` : ""}`
              : ""}
          </span>
        </button>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs font-medium",
            done ? "bg-accent-soft text-accent" : "bg-surface-2 text-muted",
          )}
        >
          {Math.floor(g.progress * 100)}%
        </span>
        <Button size="sm" variant="ghost" onClick={onEdit}>
          Editar
        </Button>
      </div>
      <div>
        <p className="num text-2xl font-semibold tracking-[-0.025em]">
          <AnimatedNumber value={g.savedCents} />
        </p>
        <p className="text-[13.5px] text-muted">de {money(g.targetCents)}</p>
      </div>
      {g.box?.cdiPercent ? (
        <p className="-mt-2 flex flex-wrap items-center gap-1.5 text-[13px] text-fg-2">
          <TrendingUp className="size-4 text-primary" aria-hidden />
          Rendeu <b className="num text-primary">{money(g.box.monthYieldCents)}</b> este mês
          {g.box.cdiAnnualPercent ? (
            <span className="text-muted">
              · CDI {g.box.cdiAnnualPercent.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% ao ano
            </span>
          ) : null}
        </p>
      ) : null}
      <div className="h-2 overflow-hidden rounded-full bg-surface-2">
        <div
          className="bar-fill h-full rounded-full"
          style={{ width: `${pct * 100}%`, background: g.color }}
        />
      </div>
      <p className="rounded-[14px] bg-surface-2 px-3 py-2.5 text-[13.5px] text-fg-2">
        {pace}
        {behind ? (
          <span className="mt-1 block text-warn">
            No ritmo dos últimos 3 meses ({money(g.recentMonthlyCents)}/mês) vai faltar.
          </span>
        ) : null}
      </p>

      {mode ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const cents = parseBRL(value);
            if (!cents || cents <= 0) return setError("Digite um valor como 100,00.");
            setError(null);
            save.mutate(cents);
          }}
        >
          {g.box ? (
            <label className="flex items-center gap-2 text-[13px] text-muted">
              {mode === "in" ? "Sai de" : "Volta para"}
              <select
                value={fromId}
                onChange={(e) => setFrom(e.target.value)}
                className="h-8 flex-1 rounded-md border border-line-strong bg-surface px-1.5 text-fg"
              >
                {others.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} · {money(a.balanceCents)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="flex gap-1.5">
            <input
              // biome-ignore lint/a11y/noAutofocus: abre direto no valor ao tocar em Aportar/Retirar
              autoFocus
              data-autofocus
              inputMode="decimal"
              placeholder="0,00"
              aria-label={
                mode === "in"
                  ? g.box
                    ? "Valor para guardar"
                    : "Valor do aporte"
                  : g.box
                    ? "Valor do resgate"
                    : "Valor da retirada"
              }
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="num h-9 min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-2.5"
            />
            <Button type="submit" size="sm" variant="primary" loading={save.isPending}>
              {mode === "in" ? (g.box ? "Guardar" : "Aportar") : g.box ? "Resgatar" : "Retirar"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode(null)}>
              Cancelar
            </Button>
          </div>
          {error ? <p className="text-[13px] text-danger">{error}</p> : null}
        </form>
      ) : (
        <div className="flex gap-2">
          <Button size="sm" className="flex-1" onClick={() => setMode("in")}>
            <Plus className="size-4" aria-hidden /> {g.box ? "Guardar" : "Aportar"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setMode("out")} disabled={g.savedCents <= 0}>
            <Minus className="size-4" aria-hidden /> {g.box ? "Resgatar" : "Retirar"}
          </Button>
        </div>
      )}
    </Card>
  );
}

const centsText = (c: number) => formatBRL(c).replace("R$ ", "");

function GoalForm({ goal, onDone }: { goal: Goal | null; onDone: () => void }) {
  const queryClient = useQueryClient();
  const { data: me } = useQuery(meQuery);
  const today = todayIn(me?.settings.timezone);
  const [name, setName] = useState(goal?.name ?? "");
  const [target, setTarget] = useState(goal ? centsText(goal.targetCents) : "");
  const [date, setDate] = useState(goal?.targetDate ?? addMonths(today, 12));
  const [noDate, setNoDate] = useState(goal ? goal.targetDate === null : false);
  const [initial, setInitial] = useState("");
  // Caixinha: o dinheiro sai de uma conta ao guardar e rende pelo % do CDI.
  const [asBox, setAsBox] = useState(true);
  const [yields, setYields] = useState(true);
  const [cdi, setCdi] = useState(goal?.box?.cdiPercent ? String(goal.box.cdiPercent / 100) : "100");
  const [bankBalance, setBankBalance] = useState("");
  const cdiPercent = () => {
    const v = Number(cdi.replace(",", "."));
    return yields && v > 0 && v <= 500 ? Math.round(v * 100) : null;
  };
  const [color, setColor] = useState(goal?.color ?? PALETTE[0]);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const history = useQuery({ ...goalHistoryQuery(goal?.id ?? ""), enabled: Boolean(goal) });

  const finish = async (msg: string) => {
    await queryClient.invalidateQueries({ queryKey: ["goals"] });
    toast(msg);
    onDone();
  };
  const onError = (e: unknown) =>
    setError(e instanceof ApiRequestError ? e.message : "Não foi possível salvar.");

  const save = useMutation({
    mutationFn: async () => {
      const targetCents = parseBRL(target);
      if (!targetCents || targetCents <= 0)
        throw new ApiRequestError(400, { erro: "x", mensagem: "Quanto você quer juntar?" });
      const targetDate = noDate ? null : date;
      if (goal) return updateGoal(goal.id, { name: name.trim(), targetCents, targetDate, color });
      const initialCents = initial.trim() ? (parseBRL(initial) ?? 0) : 0;
      return createGoal({
        name: name.trim(),
        targetCents,
        targetDate,
        color,
        initialCents,
        ...(asBox ? { box: { cdiPercent: cdiPercent() } } : {}),
      });
    },
    onSuccess: () => finish(goal ? "Meta atualizada" : "Meta criada"),
    onError,
  });
  const archive = useMutation({
    mutationFn: () => toggleArchiveGoal(goal?.id ?? ""),
    onSuccess: () => finish(goal?.archived ? "Meta reativada" : "Meta arquivada"),
    onError,
  });
  const remove = useMutation({
    mutationFn: () => deleteGoal(goal?.id ?? ""),
    onSuccess: () => finish("Meta excluída"),
    onError,
  });
  const boxAction = useMutation({
    mutationFn: async (kind: "convert" | "adjust" | "rate") => {
      if (!goal) throw new Error("sem meta");
      if (kind === "convert") return convertGoal(goal.id, cdiPercent());
      if (!goal.box) throw new Error("sem caixinha");
      if (kind === "rate") return updateAccount(goal.box.accountId, { cdiPercent: cdiPercent() });
      const cents = parseBRL(bankBalance);
      if (cents === null || cents < 0)
        throw new ApiRequestError(400, { erro: "x", mensagem: "Digite o saldo como 1.234,56." });
      return adjustBalance(goal.box.accountId, cents);
    },
    onSuccess: async (_, kind) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["goals"] }),
        invalidateMoney(queryClient),
      ]);
      toast(
        kind === "convert"
          ? "Agora é uma caixinha"
          : kind === "rate"
            ? "Rendimento atualizado"
            : "Saldo ajustado",
      );
      setBankBalance("");
      if (kind === "convert") onDone();
    },
    onError,
  });
  const removeEntry = useMutation({
    mutationFn: (cid: string) => deleteContribution(goal?.id ?? "", cid),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["goals"] });
      toast("Movimento excluído");
    },
  });

  return (
    <form
      className="flex flex-col gap-[18px]"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return setError("Dê um nome para a meta.");
        setError(null);
        save.mutate();
      }}
    >
      <Field label="Nome">
        {(p) => (
          <Input
            {...p}
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Viagem para o Chile"
          />
        )}
      </Field>
      <Field label="Quanto precisa">
        {(p) => (
          <Input
            {...p}
            inputMode="decimal"
            className="num"
            placeholder="0,00"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
        )}
      </Field>
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-muted">Até quando</span>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="date"
            aria-label="Data da meta"
            disabled={noDate}
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="h-[42px] rounded-control border border-line-strong bg-surface px-3 disabled:opacity-50"
          />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={noDate} onChange={(e) => setNoDate(e.target.checked)} /> Sem data
          </label>
        </div>
      </div>
      {!goal ? (
        <div className="flex flex-col gap-3 rounded-[14px] bg-surface-2 p-3.5">
          <label className="flex items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={asBox}
              onChange={(e) => setAsBox(e.target.checked)}
              className="mt-0.5 size-[18px] accent-primary"
            />
            <span>
              <b className="flex items-center gap-1.5">
                <PiggyBank className="size-4 text-primary" aria-hidden /> Guardar numa caixinha
              </b>
              <span className="text-muted">
                Como a caixinha do banco: ao guardar, o dinheiro sai de uma conta e o saldo da meta é o dela.
              </span>
            </span>
          </label>
          {asBox ? (
            <label className="flex flex-wrap items-center gap-2 pl-7 text-sm">
              <input
                type="checkbox"
                checked={yields}
                onChange={(e) => setYields(e.target.checked)}
                className="size-[18px] accent-primary"
              />
              Rende
              <input
                aria-label="Percentual do CDI"
                inputMode="decimal"
                disabled={!yields}
                value={cdi}
                onChange={(e) => setCdi(e.target.value)}
                className="num h-8 w-16 rounded-md border border-line-strong bg-surface px-2 text-right disabled:opacity-50"
              />
              % do CDI
            </label>
          ) : null}
        </div>
      ) : null}
      {!goal ? (
        <Field
          label={
            asBox
              ? "Já tem dinheiro nessa caixinha? (opcional)"
              : "Já tem algo guardado para isso? (opcional)"
          }
        >
          {(p) => (
            <Input
              {...p}
              inputMode="decimal"
              className="num"
              placeholder="0,00"
              value={initial}
              onChange={(e) => setInitial(e.target.value)}
            />
          )}
        </Field>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-muted">Cor</span>
        <div className="flex flex-wrap gap-2">
          {PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Cor ${c}`}
              aria-pressed={color === c}
              onClick={() => setColor(c)}
              className={cn("size-8 rounded-full border-2", color === c ? "border-fg" : "border-transparent")}
              style={{ background: c }}
            />
          ))}
        </div>
      </div>

      {error ? <Alert>{error}</Alert> : null}

      {goal?.box ? (
        <div className="flex flex-col gap-3 rounded-[14px] bg-surface-2 p-3.5 text-sm">
          <b className="flex items-center gap-1.5">
            <PiggyBank className="size-4 text-primary" aria-hidden /> {goal.box.accountName}
          </b>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="checkbox"
              checked={yields}
              onChange={(e) => setYields(e.target.checked)}
              aria-label="Rende pelo CDI"
              className="size-[18px] accent-primary"
            />
            Rende
            <input
              aria-label="Percentual do CDI"
              inputMode="decimal"
              disabled={!yields}
              value={cdi}
              onChange={(e) => setCdi(e.target.value)}
              className="num h-8 w-16 rounded-md border border-line-strong bg-surface px-2 text-right disabled:opacity-50"
            />
            % do CDI
            <Button
              size="sm"
              loading={boxAction.isPending && boxAction.variables === "rate"}
              onClick={() => boxAction.mutate("rate")}
            >
              Salvar
            </Button>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-muted">
              O banco mostra outro valor? Informe o saldo de lá e o Miu lança a diferença como rendimento.
            </span>
            <div className="flex gap-2">
              <input
                aria-label="Saldo no banco"
                inputMode="decimal"
                placeholder={centsText(goal.savedCents)}
                value={bankBalance}
                onChange={(e) => setBankBalance(e.target.value)}
                className="num h-9 min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-2.5"
              />
              <Button
                size="sm"
                loading={boxAction.isPending && boxAction.variables === "adjust"}
                onClick={() => boxAction.mutate("adjust")}
              >
                Ajustar saldo
              </Button>
            </div>
          </div>
        </div>
      ) : goal ? (
        <div className="flex flex-col gap-2 rounded-[14px] bg-surface-2 p-3.5 text-sm">
          <b className="flex items-center gap-1.5">
            <PiggyBank className="size-4 text-primary" aria-hidden /> Transformar em caixinha
          </b>
          <span className="text-muted">
            O que já foi guardado vira o saldo de uma conta-caixinha, que pode render pelo CDI. Os aportes
            antigos ficam no histórico.
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="checkbox"
              checked={yields}
              onChange={(e) => setYields(e.target.checked)}
              aria-label="Rende pelo CDI"
              className="size-[18px] accent-primary"
            />
            Rende
            <input
              aria-label="Percentual do CDI"
              inputMode="decimal"
              disabled={!yields}
              value={cdi}
              onChange={(e) => setCdi(e.target.value)}
              className="num h-8 w-16 rounded-md border border-line-strong bg-surface px-2 text-right disabled:opacity-50"
            />
            % do CDI
            <Button
              size="sm"
              variant="primary"
              loading={boxAction.isPending}
              onClick={() => boxAction.mutate("convert")}
            >
              Transformar
            </Button>
          </div>
        </div>
      ) : null}

      {goal && history.data?.length ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-muted">Movimentos</span>
          <ul className="overflow-hidden rounded-[14px] bg-surface-2">
            {history.data.map((h) => (
              <li
                key={h.id}
                className="flex items-center gap-3 border-t border-line px-3.5 py-2.5 text-sm first:border-t-0"
              >
                <span className="text-muted">{dayShort(h.date)}</span>
                <span className="flex-1 truncate text-muted">
                  {h.note ?? (h.amountCents > 0 ? "Aporte" : "Retirada")}
                </span>
                <b className={cn("num", h.amountCents > 0 ? "text-accent" : "text-fg")}>
                  {h.amountCents > 0 ? "+ " : "− "}
                  {money(Math.abs(h.amountCents))}
                </b>
                {h.fromBox ? null : (
                  <button
                    type="button"
                    aria-label="Excluir movimento"
                    onClick={() => removeEntry.mutate(h.id)}
                    className="text-faint hover:text-danger"
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {goal ? (
        <button
          type="button"
          onClick={() => archive.mutate()}
          disabled={archive.isPending}
          className="self-start text-sm font-medium text-muted hover:text-fg hover:underline"
        >
          {goal.archived ? "Reativar meta" : "Arquivar meta (some da lista, mantém o histórico)"}
        </button>
      ) : null}

      <div className="sticky -bottom-5 -mx-5 -mb-5 mt-auto flex flex-wrap items-center justify-end gap-2.5 border-t border-line bg-surface px-5 pt-3.5 pb-[calc(14px+env(safe-area-inset-bottom))]">
        {goal && confirm ? (
          <>
            <div className="mr-auto min-w-0 text-sm">
              <b className="block">Excluir esta meta?</b>
              <span className="text-muted">Os movimentos dela também somem.</span>
            </div>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Voltar
            </Button>
            <Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>
              Excluir
            </Button>
          </>
        ) : (
          <>
            {goal ? (
              <Button variant="danger" className="mr-auto" onClick={() => setConfirm(true)}>
                <Trash2 className="size-4" aria-hidden /> Excluir
              </Button>
            ) : null}
            <Button variant="ghost" onClick={onDone}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" loading={save.isPending}>
              {goal ? "Salvar" : "Criar meta"}
            </Button>
          </>
        )}
      </div>
    </form>
  );
}
