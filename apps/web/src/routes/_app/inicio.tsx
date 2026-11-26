import type { Account, BudgetLine, Category, Dashboard, Pace } from "@miu/shared";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  ChevronRight,
  CreditCard,
  Target,
  Wallet,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { IconTile } from "@/components/category-icon";
import { Donut, PaceChart, paceTone } from "@/components/charts";
import { InstitutionLogo } from "@/components/institution-logo";
import { MonthSummary } from "@/components/month-summary";
import { useQuickAdd } from "@/components/quick-add";
import { LimitForm, whole } from "@/components/spending-limit";
import { StatusPill } from "@/components/status-pill";
import { byId, TransactionRow } from "@/components/transaction-row";
import { Button, Card, CardTitle, DeltaPill } from "@/components/ui";
import { cn } from "@/lib/cn";
import { accountsQuery, budgetsQuery, categoriesQuery, dashboardQuery, paceQuery } from "@/lib/finance";
import { dayShort, MONTHS_SHORT, money, WEEKDAYS } from "@/lib/format";
import { meQuery } from "@/lib/me";

export const Route = createFileRoute("/_app/inicio")({
  loader: ({ context }) => {
    const qc = context.queryClient;
    void qc.prefetchQuery(dashboardQuery);
    void qc.prefetchQuery(paceQuery());
    void qc.prefetchQuery(accountsQuery);
    void qc.prefetchQuery(categoriesQuery);
  },
  head: () => ({ meta: [{ title: "Visão geral · Miu Controle" }] }),
  component: Inicio,
});

function greeting(hour: number) {
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

function Inicio() {
  const { data: me } = useSuspenseQuery(meQuery);
  const tz = me?.settings.timezone ?? "America/Sao_Paulo";
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(new Date()),
  );
  const dash = useQuery(dashboardQuery);
  const pace = useQuery(paceQuery());
  const accounts = useQuery(accountsQuery);
  const categories = useQuery(categoriesQuery);
  const d = dash.data;
  const budgets = useQuery({ ...budgetsQuery(d?.month ?? ""), enabled: Boolean(d) });
  const accMap = byId(accounts.data);
  const catMap = byId(categories.data);
  const banks = (accounts.data ?? []).filter((a) => !a.archived && !a.card);

  const subtitle = d ? (
    <p className="-mt-4 text-[15px] text-muted">
      {greeting(hour)}
      {me?.name ? `, ${me.name.split(" ")[0]}` : ""} · {weekdayLabel(d.today)}
    </p>
  ) : null;

  if (accounts.isSuccess && banks.length === 0) {
    return (
      <>
        {subtitle}
        <Card className="flex flex-col items-center gap-3 px-6 py-14 text-center">
          <span className="grid size-12 place-items-center rounded-2xl bg-accent-soft text-primary">
            <Wallet className="size-6" aria-hidden />
          </span>
          <h3 className="text-xl font-semibold">Cadastre sua primeira conta</h3>
          <p className="max-w-md text-muted">
            Informe onde seu dinheiro está e o saldo de hoje. Depois é só lançar.
          </p>
          <Link
            to="/contas"
            className="inline-flex h-11 items-center rounded-control bg-primary px-5 font-medium text-on-primary"
          >
            Ir para Contas
          </Link>
        </Card>
      </>
    );
  }

  if (!d) {
    return (
      <>
        {subtitle}
        <div className="grid gap-5 lg:grid-cols-3">
          <Card className="h-80 animate-pulse" />
          <Card className="h-80 animate-pulse lg:col-span-2" />
        </div>
      </>
    );
  }

  return (
    <>
      {subtitle}
      <div className="grid gap-5 lg:grid-cols-3">
        <SpendingCard pace={pace.data} />
        <DistributionCard dash={d} catMap={catMap} budgetLines={budgets.data?.lines ?? []} />

        <ResultCard dash={d} />
        <BalanceCard dash={d} banks={banks} />
        <StatementsCard dash={d} accMap={accMap} />

        <UpcomingCard dash={d} accMap={accMap} catMap={catMap} />
        <RecentCard dash={d} accMap={accMap} catMap={catMap} />
        <GoalCard dash={d} />
      </div>
    </>
  );
}

function weekdayLabel(date: string) {
  const [y, m, day] = date.split("-").map(Number) as [number, number, number];
  return `${WEEKDAYS[new Date(Date.UTC(y, m - 1, day)).getUTCDay()]?.toLowerCase()}, ${day} ${MONTHS_SHORT[m - 1]}`;
}

function CardLink({
  to,
  children,
}: {
  to: "/orcamentos" | "/contas" | "/cartoes" | "/recorrentes" | "/lancamentos" | "/metas";
  children: ReactNode;
}) {
  return (
    <Link to={to} className="text-sm font-medium text-primary hover:underline">
      {children}
    </Link>
  );
}

/* ---------- Gastos no mês (card herói) ---------- */

function SpendingCard({ pace }: { pace?: Pace | undefined }) {
  const [editing, setEditing] = useState(false);
  const [summary, setSummary] = useState(false);
  if (!pace) return <Card className="h-[360px] animate-pulse" />;
  const diff = pace.differenceCents;
  const badgeText =
    pace.status === "near" ? "No mesmo ritmo" : `${whole(Math.abs(diff))} ${diff < 0 ? "abaixo" : "acima"}`;

  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-card bg-primary p-[3px] shadow-card">
      <div className="flex flex-1 flex-col gap-4 rounded-[17px] bg-surface p-5">
        <CardTitle>Gastos no mês</CardTitle>
        <p className="num-display text-[38px]">
          {money(pace.spentCents)}
          {pace.limitCents ? (
            <span className="ml-1.5 text-lg font-normal tracking-normal text-muted">
              / {whole(pace.limitCents)}
            </span>
          ) : null}
        </p>
        <PaceChart
          current={pace.current}
          previous={pace.previous}
          daysInMonth={pace.daysInMonth}
          status={pace.status}
          badge={
            pace.previousToDateCents > 0 || pace.spentCents > 0 ? (
              <span
                className={cn(
                  "num whitespace-nowrap rounded-lg px-2 py-1 text-[13px] font-medium shadow-card",
                  paceTone(pace.status),
                )}
              >
                {badgeText}
              </span>
            ) : null
          }
        />
        <p className="text-[13px] text-faint">
          Tracejado: o mês passado (até hoje, {whole(pace.previousToDateCents)})
        </p>
        <div className="mt-auto">
          {editing ? (
            <LimitForm pace={pace} onDone={() => setEditing(false)} />
          ) : pace.limitCents && pace.dailyAllowanceCents !== null ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="flex items-center gap-2 text-left text-[15px] text-fg-2"
            >
              <CalendarDays className="size-[18px] shrink-0 text-primary" aria-hidden />
              {pace.remainingCents !== null && pace.remainingCents > 0 ? (
                <span>
                  Mantenha os gastos em até <b className="num text-fg">{money(pace.dailyAllowanceCents)}</b>{" "}
                  por dia
                </span>
              ) : (
                <span className="text-danger">Você passou do limite do mês</span>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-[15px] font-medium text-primary hover:underline"
            >
              Definir um limite de gastos para o mês
            </button>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={() => setSummary(true)}
        className="flex items-center justify-between px-5 py-3.5 text-left font-medium text-on-primary"
      >
        Resumo do mês
        <ChevronRight className="size-5" aria-hidden />
      </button>
      <MonthSummary open={summary} onClose={() => setSummary(false)} />
    </section>
  );
}

/* ---------- Distribuição de gastos ---------- */

function DistributionCard({
  dash,
  catMap,
  budgetLines,
}: {
  dash: Dashboard;
  catMap: Map<string, Category>;
  budgetLines: BudgetLine[];
}) {
  const total = dash.totals.expensePostedCents + dash.totals.expensePlannedCents;
  const top = dash.topCategories;
  const others = Math.max(0, total - top.reduce((s, r) => s + r.totalCents, 0));
  const budgets = new Map(budgetLines.map((b) => [b.categoryId, b]));
  const segments = [
    ...top.map((r) => {
      const cat = r.categoryId ? catMap.get(r.categoryId) : undefined;
      return {
        key: r.categoryId ?? "sem",
        value: r.totalCents,
        color: cat?.color ?? "var(--faint)",
        label: cat?.name ?? "Sem categoria",
      };
    }),
    ...(others > 0 ? [{ key: "outros", value: others, color: "var(--line-strong)", label: "Outras" }] : []),
  ];

  return (
    <Card className="flex flex-col gap-5 p-5 lg:col-span-2">
      <CardTitle aside={<CardLink to="/orcamentos">Orçamentos</CardLink>}>Distribuição de gastos</CardTitle>
      {total === 0 ? (
        <p className="py-14 text-center text-muted">Nenhuma despesa neste mês ainda.</p>
      ) : (
        <div className="flex flex-col items-center gap-6 md:flex-row">
          <Donut segments={segments} size={200}>
            <div>
              <p className="text-[13px] text-muted">Gasto total</p>
              <p className="num-display text-[28px]">{whole(total)}</p>
            </div>
          </Donut>
          <ul className="w-full min-w-0 flex-1 divide-y divide-line">
            {top.map((r) => {
              const cat = r.categoryId ? catMap.get(r.categoryId) : undefined;
              const b = r.categoryId ? budgets.get(r.categoryId) : undefined;
              const pct = Math.round((r.totalCents / total) * 100);
              return (
                <li key={r.categoryId ?? "sem"} className="flex items-center gap-3 py-2.5">
                  <IconTile icon={cat?.icon} color={cat?.color} />
                  <span className="min-w-0 truncate text-[15px] font-medium">
                    {cat?.name ?? "Sem categoria"}
                  </span>
                  <span className="num rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">{pct}%</span>
                  <span className="num ml-auto whitespace-nowrap text-right text-[15px]">
                    <b
                      className={cn(
                        "font-semibold",
                        b?.status === "over" && "text-danger",
                        b?.status === "warning" && "text-warn",
                      )}
                    >
                      {whole(r.totalCents)}
                    </b>
                    {b ? <span className="text-muted"> / {whole(b.limitCents)}</span> : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Card>
  );
}

/* ---------- Resultado do mês ---------- */

function ResultCard({ dash }: { dash: Dashboard }) {
  const t = dash.totals;
  const income = t.incomePostedCents + t.incomePlannedCents;
  const expense = t.expensePostedCents + t.expensePlannedCents;
  const result = income - expense;
  const prev = dash.previousTotals.incomeCents - dash.previousTotals.expenseCents;
  const delta = prev !== 0 ? (result - prev) / Math.abs(prev) : null;
  return (
    <Card className="flex flex-col gap-4 p-5">
      <CardTitle>Resultado do mês</CardTitle>
      <div className="flex flex-wrap items-center gap-3">
        <p className={cn("num-display text-[34px]", result < 0 && "text-danger")}>{money(result)}</p>
        <DeltaPill value={delta} />
      </div>
      <p className="-mt-2 text-sm text-muted">
        vs <span className="num">{money(prev)}</span> no mês anterior
      </p>
      <div className="mt-auto grid grid-cols-2 gap-4 border-t border-line pt-4">
        <Flow
          icon={<ArrowDownLeft className="size-4 text-primary" />}
          label="Entradas"
          value={income}
          planned={t.incomePlannedCents}
        />
        <Flow
          icon={<ArrowUpRight className="size-4 text-danger" />}
          label="Saídas"
          value={expense}
          planned={t.expensePlannedCents}
        />
      </div>
    </Card>
  );
}

function Flow({
  icon,
  label,
  value,
  planned,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  planned: number;
}) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-sm text-muted">
        {icon}
        {label}
      </p>
      <p className="num mt-1 text-lg font-semibold">{money(value)}</p>
      {planned ? <p className="num text-xs text-faint">{money(planned)} previsto</p> : null}
    </div>
  );
}

/* ---------- Saldo em contas ---------- */

function BalanceCard({ dash, banks }: { dash: Dashboard; banks: Account[] }) {
  return (
    <Card className="flex flex-col gap-4 p-5">
      <CardTitle aside={<CardLink to="/contas">Contas</CardLink>}>Saldo em contas</CardTitle>
      <p className={cn("num-display text-[34px]", dash.bankBalanceCents < 0 && "text-danger")}>
        {money(dash.bankBalanceCents)}
      </p>
      <div className="rounded-[14px] bg-surface-2 px-3.5 py-3">
        <p className="text-[13px] text-muted">Previsto para o fim do mês</p>
        <p className={cn("num text-lg font-semibold", dash.projectedEndCents < 0 && "text-danger")}>
          {money(dash.projectedEndCents)}
        </p>
        <p className="text-xs text-faint">já descontando contas previstas e faturas do mês</p>
      </div>
      <ul className="mt-auto flex flex-col gap-2">
        {banks.slice(0, 3).map((a) => (
          <li key={a.id} className="flex items-center gap-2 text-sm">
            <InstitutionLogo account={a} className="size-6 rounded-[7px]" />
            <span className="flex-1 truncate text-fg-2">{a.name}</span>
            <span className={cn("num font-medium", a.balanceCents < 0 && "text-danger")}>
              {money(a.balanceCents)}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ---------- Faturas ---------- */

function StatementsCard({ dash, accMap }: { dash: Dashboard; accMap: Map<string, Account> }) {
  const total = dash.cards.reduce((s, c) => s + c.statement.remainingCents, 0);
  return (
    <Card className="flex flex-col gap-4 p-5">
      <CardTitle aside={<CardLink to="/cartoes">Cartões</CardLink>}>Faturas</CardTitle>
      {dash.cards.length === 0 ? (
        <div className="flex flex-1 flex-col items-start justify-center gap-2 text-muted">
          <CreditCard className="size-6 text-faint" aria-hidden />
          <p className="text-sm">Cadastre seus cartões para ver as faturas aqui.</p>
        </div>
      ) : (
        <>
          <p className="num-display text-[34px]">{money(total)}</p>
          <p className="-mt-2 text-sm text-muted">
            Saldo após pagar: <b className="num text-fg">{money(dash.bankBalanceCents - total)}</b>
          </p>
          <ul className="mt-auto flex flex-col gap-2.5">
            {dash.cards.map((c) => {
              const a = accMap.get(c.accountId);
              return (
                <li key={c.accountId}>
                  <Link
                    to="/cartoes"
                    search={{ id: c.accountId, fatura: c.statement.month }}
                    className="flex items-center gap-2.5 text-sm"
                  >
                    <InstitutionLogo
                      account={a ?? { kind: "credit_card", color: "var(--muted)" }}
                      className="size-8"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{a?.name ?? "Cartão"}</span>
                      <span className="text-xs text-muted">vence {dayShort(c.statement.dueDate)}</span>
                    </span>
                    <StatusPill status={c.statement.status} />
                    <span className="num min-w-[84px] text-right font-medium">
                      {money(c.statement.remainingCents)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Card>
  );
}

/* ---------- Próximas recorrências ---------- */

function UpcomingCard({
  dash,
  accMap,
  catMap,
}: {
  dash: Dashboard;
  accMap: Map<string, Account>;
  catMap: Map<string, Category>;
}) {
  const items = dash.upcoming.slice(0, 5);
  return (
    <Card className="flex flex-col gap-3 p-5">
      <CardTitle aside={<CardLink to="/recorrentes">Recorrentes</CardLink>}>Próximos 15 dias</CardTitle>
      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">Nada previsto para os próximos dias.</p>
      ) : null}
      <ul className="divide-y divide-line">
        {items.map((u) => {
          if (u.type === "statement") {
            const a = accMap.get(u.accountId);
            return (
              <li key={`s-${u.accountId}-${u.statement.month}`} className="flex items-center gap-3 py-2.5">
                <InstitutionLogo
                  account={a ?? { kind: "credit_card", color: "var(--muted)" }}
                  className="size-8"
                />
                <span className="flex-1 truncate text-[15px] font-medium">Fatura {a?.name}</span>
                <span className="num text-[15px] font-medium">{money(u.statement.remainingCents)}</span>
                <span className="num w-12 text-right text-sm text-muted">{dayShort(u.date)}</span>
              </li>
            );
          }
          const tx = u.transaction;
          const cat = tx.categoryId ? catMap.get(tx.categoryId) : undefined;
          return (
            <li key={tx.id} className="flex items-center gap-3 py-2.5">
              <IconTile
                icon={cat?.icon}
                color={cat?.color}
                transfer={tx.kind === "transfer"}
                className="size-8"
              />
              <span className="flex-1 truncate text-[15px] font-medium">{tx.description}</span>
              <span className={cn("num text-[15px] font-medium", tx.kind === "income" && "text-primary")}>
                {tx.kind === "income" ? "+ " : ""}
                {money(tx.amountCents)}
              </span>
              <span
                className={cn(
                  "num w-12 text-right text-sm",
                  tx.date < dash.today ? "text-warn" : "text-muted",
                )}
              >
                {dayShort(tx.date)}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/* ---------- Últimos lançamentos ---------- */

function RecentCard({
  dash,
  accMap,
  catMap,
}: {
  dash: Dashboard;
  accMap: Map<string, Account>;
  catMap: Map<string, Category>;
}) {
  const { openNew } = useQuickAdd();
  return (
    <Card className="flex flex-col gap-1 py-5">
      <div className="px-5">
        <CardTitle aside={<CardLink to="/lancamentos">Ver todos</CardLink>}>Últimos lançamentos</CardTitle>
      </div>
      {dash.recent.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-5 py-8 text-center text-sm text-muted">
          Nada lançado ainda.
          <Button size="sm" variant="primary" onClick={() => openNew()}>
            Novo lançamento
          </Button>
        </div>
      ) : (
        <div className="mt-1">
          {dash.recent.slice(0, 5).map((tx) => (
            <TransactionRow key={tx.id} tx={tx} accounts={accMap} categories={catMap} showDate />
          ))}
        </div>
      )}
    </Card>
  );
}

/* ---------- Metas ---------- */

function GoalCard({ dash }: { dash: Dashboard }) {
  const g = dash.goalHighlight;
  return (
    <Card className="flex flex-col gap-4 p-5">
      <CardTitle aside={<CardLink to="/metas">Metas</CardLink>}>Meta em destaque</CardTitle>
      {!g ? (
        <div className="flex flex-1 flex-col items-start justify-center gap-2">
          <Target className="size-6 text-faint" aria-hidden />
          <p className="text-sm text-muted">Crie uma meta para acompanhar quanto falta.</p>
          <CardLink to="/metas">Criar meta</CardLink>
        </div>
      ) : (
        <>
          <div
            className="flex flex-col gap-3 rounded-[16px] p-4"
            style={{ background: `color-mix(in srgb, ${g.color} 14%, var(--surface))` }}
          >
            <span
              className="w-fit rounded-full bg-surface px-2.5 py-0.5 text-xs font-medium"
              style={{ color: g.color }}
            >
              {Math.floor((g.savedCents / g.targetCents) * 100)}% concluída
            </span>
            <p className="text-xl font-semibold tracking-[-0.02em]">{g.name}</p>
            {g.targetDate ? (
              <p className="-mt-2 text-sm text-fg-2">Até {g.targetDate.split("-").reverse().join("/")}</p>
            ) : null}
          </div>
          <div className="mt-auto flex items-center gap-3 text-sm">
            <span className="num text-muted">{whole(g.savedCents)}</span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
              <span
                className="block h-full rounded-full"
                style={{
                  width: `${Math.min(100, (g.savedCents / g.targetCents) * 100)}%`,
                  background: g.color,
                }}
              />
            </span>
            <span className="num text-muted">{whole(g.targetCents)}</span>
          </div>
        </>
      )}
    </Card>
  );
}
