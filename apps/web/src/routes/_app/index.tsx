import type { Dashboard } from "@miu/shared";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CreditCard, Wallet } from "lucide-react";
import { BudgetsCard } from "@/components/budgets-card";
import { IconTile } from "@/components/category-icon";
import { useQuickAdd } from "@/components/quick-add";
import { StatusPill } from "@/components/status-pill";
import { byId, TransactionRow } from "@/components/transaction-row";
import { Button, Card } from "@/components/ui";
import { cn } from "@/lib/cn";
import { accountsQuery, categoriesQuery, dashboardQuery } from "@/lib/finance";
import { dayShort, MONTHS_SHORT, money, monthShort, WEEKDAYS } from "@/lib/format";
import { meQuery } from "@/lib/me";

export const Route = createFileRoute("/_app/")({
  loader: ({ context }) => {
    // Busca em paralelo antes de renderizar; o painel inteiro vem numa request.
    const qc = context.queryClient;
    void qc.prefetchQuery(dashboardQuery);
    void qc.prefetchQuery(accountsQuery);
    void qc.prefetchQuery(categoriesQuery);
  },
  head: () => ({ meta: [{ title: "Início · Miu Controle" }] }),
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
  const { openNew } = useQuickAdd();
  const dash = useQuery(dashboardQuery);
  const accounts = useQuery(accountsQuery);
  const categories = useQuery(categoriesQuery);
  const accMap = byId(accounts.data);
  const catMap = byId(categories.data);
  const d = dash.data;
  const banks = (accounts.data ?? []).filter((a) => !a.archived && !a.card);

  const header = d ? (
    <div>
      <p className="text-sm text-muted">{weekdayLabel(d.today)}</p>
      <h2 className="text-[26px] font-semibold tracking-[-0.03em]">
        {greeting(hour)}
        {me?.name ? `, ${me.name.split(" ")[0]}` : ""}
      </h2>
    </div>
  ) : (
    <div className="h-14" />
  );

  if (accounts.isSuccess && banks.length === 0) {
    return (
      <>
        {header}
        <Card className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <span className="grid size-11 place-items-center rounded-xl bg-accent-soft text-accent">
            <Wallet className="size-5" aria-hidden />
          </span>
          <h3 className="text-lg font-semibold">Cadastre sua primeira conta</h3>
          <p className="max-w-md text-muted">
            Informe onde seu dinheiro está e o saldo de hoje. Depois é só lançar.
          </p>
          <Link
            to="/contas"
            className="inline-flex h-10 items-center rounded-control bg-primary px-4 font-medium text-on-primary"
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
        {header}
        <Card className="h-40 animate-pulse" aria-label="Carregando" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="h-28 animate-pulse" />
          <Card className="h-28 animate-pulse" />
          <Card className="h-28 animate-pulse" />
        </div>
      </>
    );
  }

  const t = d.totals;
  const income = t.incomePostedCents + t.incomePlannedCents;
  const expense = t.expensePostedCents + t.expensePlannedCents;
  const topMax = Math.max(1, ...d.topCategories.map((c) => c.totalCents));
  const monthExpense = Math.max(1, expense);

  return (
    <>
      {header}

      <div className={cn("grid gap-4", d.cards.length > 0 && "lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]")}>
        <Card className="flex flex-col gap-5 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[13px] font-medium text-muted">Saldo em contas</p>
              <p className="num text-[clamp(30px,4.6vw,44px)] font-semibold leading-tight tracking-[-0.035em]">
                {money(d.bankBalanceCents)}
              </p>
              <p className="mt-1 text-[13px] text-muted">
                Previsto para o fim de {monthShort(d.month)}:{" "}
                <b className={cn("num", d.projectedEndCents < 0 ? "text-danger" : "text-fg")}>
                  {money(d.projectedEndCents)}
                </b>
                <span className="text-faint">
                  {d.cardsDueThisMonthCents
                    ? " · já descontando contas e faturas do mês"
                    : " · já descontando as contas previstas"}
                </span>
              </p>
            </div>
            <Button size="sm" variant="primary" onClick={() => openNew()}>
              Novo lançamento
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {banks.map((a) => (
              <Link
                key={a.id}
                to="/lancamentos"
                search={{ conta: a.id }}
                className="inline-flex h-[34px] items-center gap-1.5 rounded-full border border-line-strong px-3 text-sm text-fg-2 hover:bg-surface-2"
              >
                <span className="size-2 rounded-full" style={{ background: a.color }} aria-hidden />
                {a.name}{" "}
                <b className={cn("num", a.balanceCents < 0 ? "text-danger" : "text-fg")}>
                  {money(a.balanceCents)}
                </b>
              </Link>
            ))}
          </div>
        </Card>
        {d.cards.length ? <CardsBlock dash={d} names={accMap} /> : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-[13px] font-medium text-muted">Receitas · {monthShort(d.month)}</p>
          <p className="num mt-1 text-2xl font-semibold tracking-[-0.025em] text-accent">
            {money(t.incomePostedCents)}
          </p>
          <p className="mt-1 text-[13px] text-muted">
            {t.incomePlannedCents ? `+ ${money(t.incomePlannedCents)} previsto` : "Nada previsto"}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-[13px] font-medium text-muted">Despesas · {monthShort(d.month)}</p>
          <p className="num mt-1 text-2xl font-semibold tracking-[-0.025em]">{money(t.expensePostedCents)}</p>
          <p className="mt-1 text-[13px] text-muted">
            {t.expensePlannedCents ? `+ ${money(t.expensePlannedCents)} previsto` : "Nada previsto"}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-[13px] font-medium text-muted">Resultado do mês</p>
          <p
            className={cn(
              "num mt-1 text-2xl font-semibold tracking-[-0.025em]",
              income - expense < 0 && "text-danger",
            )}
          >
            {money(income - expense)}
          </p>
          <p className="mt-1 text-[13px] text-muted">
            {income > 0
              ? `Você guarda ${Math.max(0, Math.round((1 - expense / income) * 100))}% do que entra`
              : "Sem receitas no mês"}
          </p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card>
          <div className="flex items-center justify-between px-5 pt-4">
            <h3 className="text-[15px] font-semibold">Gastos por categoria</h3>
            <Link to="/relatorios" className="text-sm font-medium text-accent hover:underline">
              Relatórios
            </Link>
          </div>
          <div className="flex flex-col gap-3.5 px-5 pt-4 pb-5">
            {d.topCategories.length === 0 ? (
              <p className="py-6 text-center text-muted">Nenhuma despesa neste mês.</p>
            ) : null}
            {d.topCategories.map((row) => {
              const cat = row.categoryId ? catMap.get(row.categoryId) : undefined;
              return (
                <div key={row.categoryId ?? "none"} className="flex items-center gap-3">
                  <IconTile icon={cat?.icon} color={cat?.color} />
                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
                      <span className="truncate font-medium">{cat?.name ?? "Sem categoria"}</span>
                      <span className="num">
                        <b>{money(row.totalCents)}</b>{" "}
                        <span className="text-faint">
                          {Math.round((row.totalCents / monthExpense) * 100)}%
                        </span>
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(row.totalCents / topMax) * 100}%`,
                          background: cat?.color ?? "var(--muted)",
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between px-5 pt-4">
            <h3 className="text-[15px] font-semibold">Próximos 15 dias</h3>
            <Link to="/recorrentes" className="text-sm font-medium text-accent hover:underline">
              Recorrentes
            </Link>
          </div>
          <div className="mt-2">
            {d.upcoming.length === 0 ? (
              <p className="px-5 py-8 text-center text-muted">Nada para os próximos dias.</p>
            ) : null}
            {d.upcoming.map((u) =>
              u.type === "transaction" ? (
                <TransactionRow
                  key={u.transaction.id}
                  tx={u.transaction}
                  accounts={accMap}
                  categories={catMap}
                  showDate
                />
              ) : (
                <Link
                  key={`${u.accountId}-${u.statement.month}`}
                  to="/cartoes"
                  search={{ id: u.accountId, fatura: u.statement.month }}
                  className="flex items-center gap-3 border-t border-line px-5 py-3 first:border-t-0 hover:bg-surface-2"
                >
                  <CardTile color={accMap.get(u.accountId)?.color} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-medium">
                      Fatura {accMap.get(u.accountId)?.name ?? "do cartão"}
                    </span>
                    <span className="text-[13px] text-muted">Vence {dayShort(u.date)}</span>
                  </span>
                  <span className="num text-[15px] font-semibold">− {money(u.statement.remainingCents)}</span>
                </Link>
              ),
            )}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <BudgetsCard month={d.month} />
        <Card>
          <div className="flex items-center justify-between px-5 pt-4">
            <h3 className="text-[15px] font-semibold">Últimos lançamentos</h3>
            <Link to="/lancamentos" className="text-sm font-medium text-accent hover:underline">
              Ver todos
            </Link>
          </div>
          <div className="mt-2">
            {d.recent.length === 0 ? (
              <p className="px-5 py-8 text-center text-muted">Nada lançado ainda.</p>
            ) : null}
            {d.recent.map((tx) => (
              <TransactionRow key={tx.id} tx={tx} accounts={accMap} categories={catMap} showDate />
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}

function weekdayLabel(date: string) {
  const [y, m, day] = date.split("-").map(Number) as [number, number, number];
  return `${WEEKDAYS[new Date(Date.UTC(y, m - 1, day)).getUTCDay()]}, ${day} ${MONTHS_SHORT[m - 1]}`;
}

function CardTile({ color }: { color?: string | undefined }) {
  return (
    <span
      className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-[color-mix(in_srgb,var(--c)_15%,transparent)] text-(--c)"
      style={{ "--c": color ?? "var(--muted)" } as React.CSSProperties}
      aria-hidden
    >
      <CreditCard className="size-[18px]" />
    </span>
  );
}

function CardsBlock({
  dash,
  names,
}: {
  dash: Dashboard;
  names: Map<string, { name: string; color: string }>;
}) {
  const total = dash.cards.reduce((s, c) => s + c.statement.remainingCents, 0);
  return (
    <Card className="flex flex-col gap-3.5 p-5">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-medium text-muted">Faturas a pagar</p>
        <Link to="/cartoes" className="text-sm font-medium text-accent hover:underline">
          Ver cartões
        </Link>
      </div>
      <p className="num text-2xl font-semibold tracking-[-0.025em]">{money(total)}</p>
      {dash.cards.map((c) => (
        <Link
          key={c.accountId}
          to="/cartoes"
          search={{ id: c.accountId, fatura: c.statement.month }}
          className="flex items-center gap-3 rounded-lg hover:bg-surface-2"
        >
          <CardTile color={names.get(c.accountId)?.color} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">
              {names.get(c.accountId)?.name ?? "Cartão"}
            </span>
            <span className="text-[13px] text-muted">Vence {dayShort(c.statement.dueDate)}</span>
          </span>
          <StatusPill status={c.statement.status} />
          <b className="num min-w-[88px] text-right">{money(c.statement.remainingCents)}</b>
        </Link>
      ))}
    </Card>
  );
}
