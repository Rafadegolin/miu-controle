import { addMonths, formatBRL, parseBRL, todayIn } from "@miu/core";
import { type Goal, PALETTE } from "@miu/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Minus, Plus, Target, Trash2 } from "lucide-react";
import { useState } from "react";
import { Sheet } from "@/components/sheet";
import { toast } from "@/components/toast";
import { Alert, Button, Card, Field, Input } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  contribute,
  createGoal,
  deleteContribution,
  deleteGoal,
  goalHistoryQuery,
  goalsQuery,
  toggleArchiveGoal,
  updateGoal,
} from "@/lib/finance";
import { dayShort, money, monthShort } from "@/lib/format";
import { ApiRequestError } from "@/lib/http";
import { meQuery } from "@/lib/me";

export const Route = createFileRoute("/_app/metas")({
  head: () => ({ meta: [{ title: "Metas · Miu Controle" }] }),
  component: Metas,
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
          Metas são potes: o aporte separa o dinheiro para um objetivo, sem mexer no saldo das contas. Para
          mover dinheiro de verdade, faça também uma transferência para a sua conta de reserva.
        </p>
        <Button variant="primary" onClick={() => setSheet({ open: true, goal: null })}>
          <Plus className="size-4" aria-hidden /> Nova meta
        </Button>
      </div>

      {isPending ? <Card className="h-40 animate-pulse" /> : null}
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
        {sheet.open ? (
          <GoalForm goal={sheet.goal} onDone={() => setSheet((s) => ({ ...s, open: false }))} />
        ) : null}
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
  const pct = Math.min(1, g.progress);
  const done = g.savedCents >= g.targetCents;

  const save = useMutation({
    mutationFn: (cents: number) => contribute(g.id, mode === "out" ? -cents : cents, today),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["goals"] });
      toast(mode === "out" ? "Retirada registrada" : "Aporte registrado");
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
      </div>
      <div>
        <p className="num text-2xl font-semibold tracking-[-0.025em]">{money(g.savedCents)}</p>
        <p className="text-[13.5px] text-muted">de {money(g.targetCents)}</p>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full" style={{ width: `${pct * 100}%`, background: g.color }} />
      </div>
      <p className="rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-[13.5px] text-fg-2">
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
          <div className="flex gap-1.5">
            <input
              // biome-ignore lint/a11y/noAutofocus: abre direto no valor ao tocar em Aportar/Retirar
              autoFocus
              inputMode="decimal"
              placeholder="0,00"
              aria-label={mode === "in" ? "Valor do aporte" : "Valor da retirada"}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="num h-9 min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-2.5"
            />
            <Button type="submit" size="sm" variant="primary" loading={save.isPending}>
              {mode === "in" ? "Aportar" : "Retirar"}
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
            <Plus className="size-4" aria-hidden /> Aportar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setMode("out")} disabled={g.savedCents <= 0}>
            <Minus className="size-4" aria-hidden /> Retirar
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
      return createGoal({ name: name.trim(), targetCents, targetDate, color, initialCents });
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
        <Field label="Já tem algo guardado para isso? (opcional)">
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

      {goal && history.data?.length ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-muted">Movimentos</span>
          <ul className="rounded-xl border border-line">
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
                <button
                  type="button"
                  aria-label="Excluir movimento"
                  onClick={() => removeEntry.mutate(h.id)}
                  className="text-faint hover:text-danger"
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {goal ? (
        <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface-2 p-3.5 text-sm">
          {confirm ? (
            <>
              <b>Excluir a meta "{goal.name}" e todos os movimentos?</b>
              <div className="flex gap-2">
                <Button size="sm" variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>
                  Excluir
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
                  Cancelar
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" loading={archive.isPending} onClick={() => archive.mutate()}>
                {goal.archived ? "Reativar" : "Arquivar"}
              </Button>
              <Button size="sm" variant="danger" onClick={() => setConfirm(true)}>
                Excluir
              </Button>
            </div>
          )}
        </div>
      ) : null}

      <div className="sticky -bottom-5 -mx-5 -mb-5 mt-auto flex justify-end gap-2.5 border-t border-line bg-surface px-5 pt-3.5 pb-[calc(14px+env(safe-area-inset-bottom))]">
        <Button variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" loading={save.isPending}>
          {goal ? "Salvar" : "Criar meta"}
        </Button>
      </div>
    </form>
  );
}
