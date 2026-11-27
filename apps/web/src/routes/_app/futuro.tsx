import { addYearMonth, parseBRL, projectFuture, type Scenario } from "@miu/core";
import type { Future } from "@miu/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Banknote,
  Flag,
  type LucideIcon,
  PiggyBank,
  Scissors,
  ShoppingBag,
  Sparkles,
  TriangleAlert,
  X,
} from "lucide-react";
import { useState } from "react";
import { AnimatedNumber } from "@/components/animated-number";
import { Segmented } from "@/components/controls";
import { FutureChart, type FutureMarker } from "@/components/future-chart";
import { CardsSkeleton } from "@/components/skeletons";
import { toast } from "@/components/toast";
import { Button, Card } from "@/components/ui";
import { cn } from "@/lib/cn";
import { accountsQuery, createRecurring, futureQuery, invalidateMoney, setBudget } from "@/lib/finance";
import { money, monthLabel, monthShort } from "@/lib/format";
import { describeScenario, effectText, milestoneText, scenarioSentence } from "@/lib/future-text";
import { ApiRequestError } from "@/lib/http";
import { awaitData } from "@/lib/loaders";

type Search = { meses?: 24 | undefined };

export const Route = createFileRoute("/_app/futuro")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    meses: s.meses === 24 || s.meses === "24" ? 24 : undefined,
  }),
  loaderDeps: ({ search }) => ({ meses: search.meses }),
  loader: ({ context, deps }) =>
    awaitData([context.queryClient.ensureQueryData(futureQuery(deps.meses ?? 12))]),
  head: () => ({ meta: [{ title: "Futuro · Miu Controle" }] }),
  component: Futuro,
  pendingComponent: CardsSkeleton,
});

/** Rascunho de cenário: os campos como o usuário digita (texto), convertidos na hora da conta. */
type Draft = {
  key: number;
  kind: Scenario["kind"];
  categoryId: string;
  percent: string;
  goalId: string;
  amount: string;
  installments: string;
  startMonth: string;
  sign: "mais" | "menos";
  fromAccountId: string;
};

const ADD: { kind: Scenario["kind"]; label: string; icon: LucideIcon }[] = [
  { kind: "cut", label: "Cortar gastos", icon: Scissors },
  { kind: "save", label: "Guardar todo mês", icon: PiggyBank },
  { kind: "purchase", label: "Compra parcelada", icon: ShoppingBag },
  { kind: "income", label: "Mudar a renda", icon: Banknote },
];

function toScenario(d: Draft): Scenario | null {
  const cents = parseBRL(d.amount) ?? 0;
  if (d.kind === "cut") {
    const p = Number(d.percent.replace(",", "."));
    return d.categoryId && p > 0 && p <= 100 ? { kind: "cut", categoryId: d.categoryId, percent: p } : null;
  }
  if (d.kind === "save")
    return d.goalId && cents > 0 ? { kind: "save", goalId: d.goalId, monthlyCents: cents } : null;
  if (d.kind === "purchase") {
    const n = Math.round(Number(d.installments));
    return cents > 0 && n >= 1 && n <= 48
      ? { kind: "purchase", totalCents: cents, installments: n, startMonth: d.startMonth }
      : null;
  }
  return cents > 0
    ? { kind: "income", monthlyCents: d.sign === "menos" ? -cents : cents, startMonth: d.startMonth }
    : null;
}

function Futuro() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const horizon = search.meses ?? 12;
  const q = useQuery(futureQuery(horizon));
  const { data: accounts = [] } = useQuery(accountsQuery);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const f = q.data;

  const scenarios = drafts.map(toScenario).filter((s): s is Scenario => s !== null);
  // Conta barata (24 meses no máximo): refaz a cada render, sem memo.
  const base = f ? projectFuture(f) : null;
  const next = f && scenarios.length ? projectFuture(f, scenarios) : null;

  if (!f || !base) return <CardsSkeleton />;

  const shown = next ?? base;
  const end = shown.months.at(-1);
  const startTotal = base.months[0]?.totalCents ?? 0;
  const diff = (end?.totalCents ?? 0) - startTotal;
  const accountName = (id: string) => accounts.find((a) => a.id === id)?.name;
  const monthIdx = new Map(f.months.map((m, i) => [m.month, i]));
  const markers: FutureMarker[] = shown.milestones.map((m) => ({
    index: monthIdx.get(m.month) ?? 0,
    label: milestoneText(m, accountName),
    tone: m.kind,
  }));
  const empty =
    f.variableMonthlyCents === 0 && f.goals.length === 0 && f.months.every((m) => m.knownTotalCents === 0);
  const nextMonth = addYearMonth(f.today.slice(0, 7), 1);

  const add = (kind: Scenario["kind"]) =>
    setDrafts((list) => [
      ...list,
      {
        key: Date.now(),
        kind,
        categoryId: f.categories[0]?.id ?? "",
        percent: "20",
        goalId: f.goals[0]?.id ?? "",
        amount: kind === "save" ? "300,00" : "",
        installments: "10",
        startMonth: nextMonth,
        sign: "mais",
        fromAccountId: accounts.find((a) => !a.card && !a.archived && a.kind === "checking")?.id ?? "",
      },
    ]);
  const update = (key: number, patch: Partial<Draft>) =>
    setDrafts((list) => list.map((d) => (d.key === key ? { ...d, ...patch } : d)));

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-xl text-muted">
          Para onde o seu dinheiro vai, mês a mês, e o que muda se você fizer algo diferente.
        </p>
        <Segmented
          label="Período"
          value={String(horizon) as "12" | "24"}
          onChange={(v) => navigate({ search: { meses: v === "24" ? 24 : undefined }, replace: true })}
          options={[
            { value: "12", label: "12 meses" },
            { value: "24", label: "24 meses" },
          ]}
        />
      </div>

      {empty ? (
        <Card className="flex flex-col items-center gap-2 p-8 text-center">
          <Sparkles className="size-7 text-primary" aria-hidden />
          <p className="font-semibold">Ainda não dá para ver o futuro</p>
          <p className="max-w-sm text-sm text-muted">
            Cadastre suas contas e lance alguns gastos e recorrências: o Miu usa isso para estimar o seu
            futuro.
          </p>
        </Card>
      ) : (
        <>
          <Card className="rise flex flex-col gap-4 p-5">
            <div>
              <p className="text-[13px] font-medium text-muted">
                Em{" "}
                {monthLabel(end?.month ?? f.today.slice(0, 7))
                  .toLowerCase()
                  .replace(" ", " de ")}
                {next ? ", com as mudanças," : ""} você terá
              </p>
              <p className={cn("num-display mt-1 text-[34px]", (end?.totalCents ?? 0) < 0 && "text-danger")}>
                <AnimatedNumber value={end?.totalCents ?? 0} />
              </p>
              <p className="text-[13.5px] text-muted">
                {Math.abs(diff) < 100
                  ? "o mesmo que no fim deste mês"
                  : `${money(Math.abs(diff))} a ${diff > 0 ? "mais" : "menos"} que no fim deste mês`}
              </p>
            </div>
            {next ? (
              <div className="flex flex-wrap gap-4 text-[13px] text-muted">
                <span className="flex items-center gap-1.5">
                  <span className="h-0.5 w-4 rounded-full bg-primary" /> Com as mudanças
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-4 border-t-2 border-dashed border-muted" /> Sem mudanças
                </span>
              </div>
            ) : null}
            <FutureChart
              months={f.months.map((m) => m.month)}
              base={base.months.map((m) => m.totalCents)}
              scenario={next?.months.map((m) => m.totalCents)}
              markers={markers}
            />
            <p className="text-[12.5px] text-muted">
              Conta com recorrências, parcelas, faturas
              {f.boxes.length ? ", o rendimento das caixinhas" : ""} e o seu gasto do dia a dia (média de{" "}
              {money(f.variableMonthlyCents)} por mês). Receitas que não são recorrentes não entram.
            </p>
            <details className="text-[13px]">
              <summary className="cursor-pointer text-muted">Ver mês a mês</summary>
              <table className="num mt-2 w-full">
                <tbody>
                  {shown.months.map((m, i) => (
                    <tr key={m.month} className="border-t border-line">
                      <td className="py-1.5 text-muted">{monthShort(m.month)}</td>
                      <td className="py-1.5 text-right">{money(m.totalCents)}</td>
                      {next ? (
                        <td className="py-1.5 text-right text-muted">
                          {money(base.months[i]?.totalCents ?? 0)}
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </Card>

          {shown.milestones.length ? (
            <Card className="flex flex-col gap-2 p-5">
              <h3 className="text-[15px] font-medium text-muted">Marcos no caminho</h3>
              <ul className="flex flex-col gap-2">
                {shown.milestones.map((m) => {
                  const Icon = m.kind === "goal" ? Flag : TriangleAlert;
                  return (
                    <li
                      key={`${m.kind}-${m.month}-${m.kind === "goal" ? m.goalId : ""}`}
                      className="flex items-center gap-2.5 text-sm"
                    >
                      <Icon
                        className={cn(
                          "size-4 shrink-0",
                          m.kind === "goal"
                            ? "text-primary"
                            : m.kind === "bill"
                              ? "text-warn"
                              : "text-danger",
                        )}
                        aria-hidden
                      />
                      {milestoneText(m, accountName)}
                    </li>
                  );
                })}
              </ul>
            </Card>
          ) : null}

          <Card className="flex flex-col gap-4 p-5">
            <div>
              <h3 className="font-semibold">E se…</h3>
              <p className="text-[13.5px] text-muted">Simule uma mudança. Nada é gravado até você aplicar.</p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {ADD.map((a) => (
                <Button
                  key={a.kind}
                  size="sm"
                  onClick={() => add(a.kind)}
                  disabled={a.kind === "save" && !f.goals.length}
                >
                  <a.icon className="size-4" aria-hidden /> {a.label}
                </Button>
              ))}
            </div>
            {drafts.map((d) => (
              <ScenarioCard
                key={d.key}
                draft={d}
                f={f}
                base={base}
                months={f.months.map((m) => m.month)}
                onChange={(p) => update(d.key, p)}
                onRemove={() => setDrafts((list) => list.filter((x) => x.key !== d.key))}
              />
            ))}
            {next && scenarios.length > 1 ? (
              <p className="rounded-[14px] bg-accent-soft px-3.5 py-3 text-[14px]">
                <b>Tudo junto:</b> {effectText(base, next, f)}.
              </p>
            ) : null}
            {f.goals.length === 0 ? (
              <p className="text-[13px] text-muted">
                Para simular guardar dinheiro, crie uma meta em{" "}
                <Link to="/metas" className="text-primary underline">
                  Metas
                </Link>
                .
              </p>
            ) : null}
          </Card>
        </>
      )}
    </>
  );
}

const field = "h-9 rounded-lg border border-line-strong bg-surface px-2.5 text-[14px]";

function ScenarioCard({
  draft: d,
  f,
  base,
  months,
  onChange,
  onRemove,
}: {
  draft: Draft;
  f: Future;
  base: ReturnType<typeof projectFuture>;
  months: string[];
  onChange: (p: Partial<Draft>) => void;
  onRemove: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: accounts = [] } = useQuery(accountsQuery);
  const s = toScenario(d);
  const goal = f.goals.find((g) => g.id === d.goalId);
  const cat = f.categories.find((c) => c.id === d.categoryId);
  const Icon = ADD.find((a) => a.kind === d.kind)?.icon ?? Sparkles;
  const payFrom = accounts.filter((a) => !a.card && !a.archived && a.id !== goal?.accountId);

  const apply = useMutation({
    mutationFn: async () => {
      if (!s) return;
      if (s.kind === "cut" && cat) {
        const limit = Math.round(cat.averageCents * (1 - s.percent / 100));
        await setBudget(cat.id, f.today.slice(0, 7), Math.max(100, limit));
        return `Orçamento de ${cat.name}: ${money(Math.max(100, limit))} por mês`;
      }
      if (s.kind === "save" && goal?.accountId) {
        const from = d.fromAccountId || payFrom[0]?.id;
        if (!from)
          throw new ApiRequestError(400, {
            erro: "x",
            mensagem: "Cadastre uma conta de onde sai o dinheiro.",
          });
        await createRecurring({
          kind: "transfer",
          accountId: from,
          toAccountId: goal.accountId,
          amountCents: s.monthlyCents,
          description: `Guardar · ${goal.name}`,
          startDate: `${addYearMonth(f.today.slice(0, 7), 1)}-05`,
        });
        return `Todo dia 5, ${money(s.monthlyCents)} vão para ${goal.name}`;
      }
    },
    onSuccess: async (msg) => {
      await Promise.all([
        invalidateMoney(queryClient),
        queryClient.invalidateQueries({ queryKey: ["future"] }),
      ]);
      if (msg) toast(msg);
      onRemove();
    },
    onError: (e) => toast(e instanceof ApiRequestError ? e.message : "Não foi possível aplicar."),
  });
  const canApply = s && ((s.kind === "cut" && cat) || (s.kind === "save" && goal?.accountId));

  return (
    <div className="flex flex-col gap-3 rounded-[14px] border border-line p-3.5">
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-primary" aria-hidden />
        <b className="flex-1 text-[14px]">{ADD.find((a) => a.kind === d.kind)?.label}</b>
        <button
          type="button"
          aria-label="Remover cenário"
          onClick={onRemove}
          className="text-faint hover:text-danger"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[14px]">
        {d.kind === "cut" ? (
          <>
            Cortar
            <input
              aria-label="Percentual do corte"
              inputMode="decimal"
              className={cn(field, "num w-16 text-right")}
              value={d.percent}
              onChange={(e) => onChange({ percent: e.target.value })}
            />
            % de
            <select
              aria-label="Categoria"
              className={field}
              value={d.categoryId}
              onChange={(e) => onChange({ categoryId: e.target.value })}
            >
              {f.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {money(c.averageCents)}/mês
                </option>
              ))}
            </select>
          </>
        ) : d.kind === "save" ? (
          <>
            Guardar
            <input
              aria-label="Valor por mês"
              inputMode="decimal"
              placeholder="0,00"
              className={cn(field, "num w-28")}
              value={d.amount}
              onChange={(e) => onChange({ amount: e.target.value })}
            />
            por mês em
            <select
              aria-label="Meta"
              className={field}
              value={d.goalId}
              onChange={(e) => onChange({ goalId: e.target.value })}
            >
              {f.goals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            {goal?.accountId && payFrom.length ? (
              <>
                saindo de
                <select
                  aria-label="Conta de onde sai"
                  className={field}
                  value={d.fromAccountId || payFrom[0]?.id}
                  onChange={(e) => onChange({ fromAccountId: e.target.value })}
                >
                  {payFrom.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </>
            ) : null}
          </>
        ) : d.kind === "purchase" ? (
          <>
            Comprar
            <input
              aria-label="Valor total"
              inputMode="decimal"
              placeholder="0,00"
              className={cn(field, "num w-28")}
              value={d.amount}
              onChange={(e) => onChange({ amount: e.target.value })}
            />
            em
            <input
              aria-label="Parcelas"
              inputMode="numeric"
              className={cn(field, "num w-14 text-right")}
              value={d.installments}
              onChange={(e) => onChange({ installments: e.target.value })}
            />
            x, a partir de
            <MonthSelect
              months={months}
              value={d.startMonth}
              onChange={(startMonth) => onChange({ startMonth })}
            />
          </>
        ) : (
          <>
            Ganhar
            <input
              aria-label="Valor por mês"
              inputMode="decimal"
              placeholder="0,00"
              className={cn(field, "num w-28")}
              value={d.amount}
              onChange={(e) => onChange({ amount: e.target.value })}
            />
            <select
              aria-label="A mais ou a menos"
              className={field}
              value={d.sign}
              onChange={(e) => onChange({ sign: e.target.value as Draft["sign"] })}
            >
              <option value="mais">a mais</option>
              <option value="menos">a menos</option>
            </select>
            por mês, a partir de
            <MonthSelect
              months={months}
              value={d.startMonth}
              onChange={(startMonth) => onChange({ startMonth })}
            />
          </>
        )}
      </div>

      {s ? (
        <p className="rounded-[12px] bg-surface-2 px-3 py-2.5 text-[13.5px] text-fg-2">
          {scenarioSentence(s, f, base)}
        </p>
      ) : (
        <p className="text-[13px] text-muted">Preencha os valores para ver o efeito.</p>
      )}
      {canApply ? (
        <Button
          size="sm"
          variant="ghost"
          className="self-start"
          loading={apply.isPending}
          onClick={() => apply.mutate()}
        >
          {s?.kind === "cut" ? "Aplicar como orçamento" : "Criar recorrência para guardar"}
        </Button>
      ) : null}
      <span className="sr-only">{s ? describeScenario(s, f) : ""}</span>
    </div>
  );
}

function MonthSelect({
  months,
  value,
  onChange,
}: {
  months: string[];
  value: string;
  onChange: (m: string) => void;
}) {
  return (
    <select aria-label="Mês" className={field} value={value} onChange={(e) => onChange(e.target.value)}>
      {months.map((m) => (
        <option key={m} value={m}>
          {monthShort(m)}
        </option>
      ))}
    </select>
  );
}
