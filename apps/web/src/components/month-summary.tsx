import { addYearMonth } from "@miu/core";
import type { Category, RecurringRule } from "@miu/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, PartyPopper, X } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import {
  budgetsQuery,
  cashflowQuery,
  categoriesQuery,
  dashboardQuery,
  invalidateMoney,
  paceQuery,
  pauseRecurring,
  recurringQuery,
} from "@/lib/finance";
import { MONTHS, money } from "@/lib/format";
import { IconTile } from "./category-icon";
import { PaceChart } from "./charts";
import { Switch } from "./controls";
import { LimitForm, whole } from "./spending-limit";
import { toast } from "./toast";
import { Button } from "./ui";

const monthName = (ym: string) => MONTHS[Number(ym.slice(5, 7)) - 1]?.toLowerCase() ?? "";

/** "Stories" do mês: uma sequência curta de telas com o que importa agora. */
export function MonthSummary({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setStep(0);
      d.showModal();
    }
    if (!open && d.open) d.close();
  }, [open]);

  const steps = open ? <Steps step={step} /> : null;
  const total = STEP_COUNT;
  const next = () => (step < total - 1 ? setStep(step + 1) : onClose());
  const prev = () => setStep(Math.max(0, step - 1));

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      onKeyDown={(e) => {
        if (e.target instanceof HTMLInputElement) return;
        if (e.key === "ArrowRight") next();
        if (e.key === "ArrowLeft") prev();
      }}
      aria-label="Resumo do mês"
      className="m-auto w-[calc(100%-24px)] max-w-[900px] rounded-[24px] bg-surface p-0 text-fg shadow-pop backdrop:bg-black/55"
    >
      {open ? (
        <div className="flex max-h-[90dvh] flex-col">
          <div className="flex items-center gap-3 px-5 pt-5">
            <div className="flex flex-1 gap-1.5" aria-hidden>
              {Array.from({ length: total }, (_, i) => (
                <span
                  // biome-ignore lint/suspicious/noArrayIndexKey: passos fixos
                  key={i}
                  className={cn("h-1 flex-1 rounded-full", i <= step ? "bg-primary" : "bg-surface-2")}
                />
              ))}
            </div>
            <span className="num text-xs text-muted">
              {step + 1}/{total}
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="grid size-9 place-items-center rounded-control text-muted hover:bg-surface-2 hover:text-fg"
            >
              <X className="size-[18px]" />
            </button>
          </div>
          <div className="min-h-[380px] flex-1 overflow-auto px-5 py-6 sm:px-8">{steps}</div>
          <div className="flex items-center justify-between border-t border-line px-5 py-3.5">
            <Button variant="ghost" onClick={prev} disabled={step === 0}>
              <ChevronLeft className="size-4" aria-hidden /> Voltar
            </Button>
            <Button variant="primary" onClick={next}>
              {step === total - 1 ? "Fechar" : "Próximo"}
              {step === total - 1 ? null : <ChevronRight className="size-4" aria-hidden />}
            </Button>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}

const STEP_COUNT = 5;

function Steps({ step }: { step: number }) {
  const dash = useQuery(dashboardQuery);
  const month = dash.data?.month;
  if (!dash.data || !month) return <div className="h-72 skeleton rounded-[16px] bg-surface-2" />;
  switch (step) {
    case 0:
      return <LastMonths month={month} />;
    case 1:
      return <PaceStep />;
    case 2:
      return <SubscriptionsStep />;
    case 3:
      return <BudgetsStep month={month} />;
    default:
      return <Closing />;
  }
}

/* ---------- layout de cada passo ---------- */

function Story({ kicker, title, visual }: { kicker: string; title: ReactNode; visual: ReactNode }) {
  return (
    <div className="grid items-center gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="animate-[fadeUp_.35s_ease]">
        <p className="text-sm font-medium text-primary">{kicker}</p>
        <h2 className="mt-2 text-[28px] font-semibold leading-[1.15] tracking-[-0.03em] sm:text-[34px]">
          {title}
        </h2>
      </div>
      <div className="min-w-0">{visual}</div>
    </div>
  );
}

const Hl = ({ children, tone }: { children: ReactNode; tone?: "pos" | "neg" }) => (
  <span className={cn("num", tone === "neg" ? "text-danger" : "text-primary")}>{children}</span>
);

/* ---------- 1. últimos 3 meses ---------- */

function LastMonths({ month }: { month: string }) {
  const end = addYearMonth(month, -1);
  const q = useQuery(cashflowQuery(end, 3));
  const rows = q.data ?? [];
  const income = rows.reduce((s, r) => s + r.incomeCents, 0);
  const expense = rows.reduce((s, r) => s + r.expenseCents, 0);
  const result = income - expense;
  const max = Math.max(1, ...rows.flatMap((r) => [r.incomeCents, r.expenseCents]));
  return (
    <Story
      kicker="Últimos 3 meses"
      title={
        rows.length && (income || expense) ? (
          <>
            Nos últimos 3 meses você {result >= 0 ? "guardou" : "gastou além do que entrou"}{" "}
            <Hl tone={result < 0 ? "neg" : "pos"}>{whole(Math.abs(result))}</Hl>
          </>
        ) : (
          "Ainda não há meses fechados para comparar"
        )
      }
      visual={
        <div className="flex flex-col gap-4 rounded-[18px] bg-surface-2 p-5">
          {rows.map((r) => (
            <div key={r.month} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-medium capitalize">{monthName(r.month)}</span>
                <span
                  className={cn("num font-semibold", r.incomeCents - r.expenseCents < 0 && "text-danger")}
                >
                  {money(r.incomeCents - r.expenseCents)}
                </span>
              </div>
              <Bar value={r.incomeCents} max={max} color="var(--primary)" label="Entradas" />
              <Bar value={r.expenseCents} max={max} color="var(--danger)" label="Saídas" />
            </div>
          ))}
          <div className="flex justify-between border-t border-line pt-3 text-sm">
            <span className="text-muted">Entradas {whole(income)}</span>
            <span className="text-muted">Saídas {whole(expense)}</span>
          </div>
        </div>
      }
    />
  );
}

function Bar({ value, max, color, label }: { value: number; max: number; color: string; label: string }) {
  return (
    <div className="flex items-center gap-2" title={`${label}: ${money(value)}`}>
      <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface">
        <span
          className="block h-full rounded-full"
          style={{ width: `${(value / max) * 100}%`, background: color }}
        />
      </span>
      <span className="num w-20 text-right text-xs text-muted">{whole(value)}</span>
    </div>
  );
}

/* ---------- 2. ritmo ---------- */

function PaceStep() {
  const q = useQuery(paceQuery());
  const p = q.data;
  if (!p) return <div className="h-72 skeleton rounded-[16px] bg-surface-2" />;
  return (
    <Story
      kicker="Ritmo de gastos"
      title={
        <>
          Você gastou <Hl>{whole(p.spentCents)}</Hl> e ainda tem {p.daysLeft}{" "}
          {p.daysLeft === 1 ? "dia" : "dias"} no mês
        </>
      }
      visual={
        <div className="flex flex-col gap-4 rounded-[18px] bg-surface-2 p-5">
          <PaceChart
            current={p.current}
            previous={p.previous}
            daysInMonth={p.daysInMonth}
            status={p.status}
          />
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            <Dot color="var(--primary)">abaixo do mês passado</Dot>
            <Dot color="var(--warn)">no mesmo ritmo</Dot>
            <Dot color="var(--danger)">acima</Dot>
          </div>
          <div className="border-t border-line pt-3">
            <LimitForm pace={p} />
          </div>
        </div>
      }
    />
  );
}

function Dot({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="size-2 rounded-full" style={{ background: color }} aria-hidden />
      {children}
    </span>
  );
}

/* ---------- 3. assinaturas ---------- */

function SubscriptionsStep() {
  const rules = useQuery(recurringQuery);
  const cats = useQuery(categoriesQuery);
  const catMap = new Map((cats.data ?? []).map((c) => [c.id, c]));
  const isSub = (r: RecurringRule) =>
    r.categoryId !== null && catMap.get(r.categoryId)?.name === "Assinaturas";
  const list = (rules.data ?? [])
    .filter((r) => r.kind === "expense" && (r.nextDate !== null || r.paused))
    .sort((a, b) => Number(isSub(b)) - Number(isSub(a)) || b.monthlyCents - a.monthlyCents);
  const activeYear = list.filter((r) => !r.paused).reduce((s, r) => s + r.monthlyCents * 12, 0);
  const savedYear = list.filter((r) => r.paused).reduce((s, r) => s + r.monthlyCents * 12, 0);

  return (
    <Story
      kicker="Assinaturas e contas fixas"
      title={
        list.length ? (
          <>
            Suas despesas fixas somam <Hl>{whole(activeYear)}</Hl> por ano. Alguma dá para cancelar?
          </>
        ) : (
          "Nenhuma despesa fixa cadastrada ainda"
        )
      }
      visual={
        <div className="flex flex-col gap-1 rounded-[18px] bg-surface-2 p-3">
          {list.length === 0 ? (
            <p className="p-4 text-sm text-muted">
              Cadastre assinaturas e contas em Recorrentes para vê-las aqui.
            </p>
          ) : null}
          <div className="max-h-[300px] overflow-auto">
            {list.map((r) => (
              <SubRow key={r.id} rule={r} category={r.categoryId ? catMap.get(r.categoryId) : undefined} />
            ))}
          </div>
          {savedYear > 0 ? (
            <p className="mt-1 rounded-[12px] bg-accent-soft px-3 py-2.5 text-sm text-fg-2">
              Pausadas: <b className="num text-primary">{whole(savedYear)}</b> a menos por ano
            </p>
          ) : null}
        </div>
      }
    />
  );
}

function SubRow({ rule: r, category }: { rule: RecurringRule; category?: Category | undefined }) {
  const queryClient = useQueryClient();
  const toggle = useMutation({
    mutationFn: () => pauseRecurring(r.id, !r.paused),
    onSuccess: async () => {
      await invalidateMoney(queryClient);
      toast(r.paused ? `${r.description} voltou` : `${r.description} pausada`);
    },
  });
  return (
    <div className="flex items-center gap-3 rounded-[12px] px-2 py-2">
      <IconTile icon={category?.icon} color={category?.color} className="size-8" />
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-sm font-medium", r.paused && "text-muted line-through")}>
          {r.description}
        </span>
        <span className="num text-xs text-muted">{whole(r.monthlyCents * 12)}/ano</span>
      </span>
      <Switch
        checked={!r.paused}
        disabled={toggle.isPending}
        onChange={() => toggle.mutate()}
        label={r.paused ? `Retomar ${r.description}` : `Pausar ${r.description}`}
      />
    </div>
  );
}

/* ---------- 4. orçamentos ---------- */

function BudgetsStep({ month }: { month: string }) {
  const q = useQuery(budgetsQuery(month));
  const cats = useQuery(categoriesQuery);
  const catMap = new Map((cats.data ?? []).map((c) => [c.id, c]));
  const lines = q.data?.lines ?? [];
  const attention = lines
    .filter((l) => l.status !== "ok")
    .sort((a, b) => b.spentCents / b.limitCents - a.spentCents / a.limitCents);
  return (
    <Story
      kicker="Orçamentos"
      title={
        lines.length === 0 ? (
          "Você ainda não tem orçamentos neste mês"
        ) : attention.length === 0 ? (
          <>
            Todos os {lines.length} orçamentos estão <Hl>dentro do limite</Hl>
          </>
        ) : (
          <>
            <Hl tone="neg">{attention.length}</Hl>{" "}
            {attention.length === 1 ? "orçamento pede" : "orçamentos pedem"} atenção
          </>
        )
      }
      visual={
        <div className="flex flex-col gap-3 rounded-[18px] bg-surface-2 p-5">
          {(attention.length ? attention : lines).slice(0, 5).map((l) => {
            const c = catMap.get(l.categoryId);
            const pct = Math.round((l.spentCents / l.limitCents) * 100);
            return (
              <div key={l.categoryId} className="flex items-center gap-3">
                <IconTile icon={c?.icon} color={c?.color} className="size-8" />
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between text-sm">
                    <span className="truncate font-medium">{c?.name ?? "Categoria"}</span>
                    <span className="num text-muted">
                      <b
                        className={cn(
                          l.status === "over" ? "text-danger" : l.status === "warning" && "text-warn",
                        )}
                      >
                        {whole(l.spentCents)}
                      </b>{" "}
                      / {whole(l.limitCents)}
                    </span>
                  </div>
                  <span className="mt-1.5 block h-2 overflow-hidden rounded-full bg-surface">
                    <span
                      className={cn(
                        "block h-full rounded-full",
                        l.status === "over" ? "bg-danger" : l.status === "warning" ? "bg-warn" : "bg-primary",
                      )}
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </span>
                </div>
              </div>
            );
          })}
          {lines.length === 0 ? (
            <p className="text-sm text-muted">
              Defina limites por categoria em Orçamentos para acompanhar aqui.
            </p>
          ) : null}
        </div>
      }
    />
  );
}

/* ---------- 5. fechamento ---------- */

function Closing() {
  const { data: d } = useQuery(dashboardQuery);
  if (!d) return null;
  const t = d.totals;
  const result = t.incomePostedCents + t.incomePlannedCents - (t.expensePostedCents + t.expensePlannedCents);
  return (
    <Story
      kicker="Seu mês em uma frase"
      title={
        <>
          Se tudo sair como previsto, {monthName(d.month)} fecha com{" "}
          <Hl tone={d.projectedEndCents < 0 ? "neg" : "pos"}>{whole(d.projectedEndCents)}</Hl> nas contas
        </>
      }
      visual={
        <div className="flex flex-col items-center gap-4 rounded-[18px] bg-surface-2 p-8 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-accent-soft text-primary">
            <PartyPopper className="size-7" aria-hidden />
          </span>
          <p className="text-sm text-muted">Resultado do mês (entradas − saídas)</p>
          <p className={cn("num-display text-[34px]", result < 0 && "text-danger")}>{money(result)}</p>
          <p className="max-w-[280px] text-sm text-muted">
            Já contando contas previstas, recorrências e as faturas que vencem no mês.
          </p>
        </div>
      }
    />
  );
}
