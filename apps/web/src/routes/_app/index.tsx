import { todayIn } from "@miu/core";
import { useInfiniteQuery, useQueries, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Wallet } from "lucide-react";
import { IconTile } from "@/components/category-icon";
import { useQuickAdd } from "@/components/quick-add";
import { StatementsCard } from "@/components/statements-card";
import { byId, TransactionRow } from "@/components/transaction-row";
import { Button, Card } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  accountsQuery,
  cardOverviewQuery,
  categoriesQuery,
  summaryQuery,
  transactionsQuery,
} from "@/lib/finance";
import { MONTHS_SHORT, money, monthShort, WEEKDAYS } from "@/lib/format";
import { meQuery } from "@/lib/me";

export const Route = createFileRoute("/_app/")({
  loader: ({ context }) => {
    // Começa a buscar tudo em paralelo antes de renderizar.
    const qc = context.queryClient;
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
  const today = todayIn(tz);
  const month = today.slice(0, 7);
  const [y, m, d] = today.split("-").map(Number) as [number, number, number];
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(new Date()),
  );
  const { openNew } = useQuickAdd();

  const accounts = useQuery(accountsQuery);
  const categories = useQuery(categoriesQuery);
  const summary = useQuery(summaryQuery(month));
  const recent = useInfiniteQuery(transactionsQuery({ month }));

  const active = (accounts.data ?? []).filter((a) => !a.archived && a.kind !== "credit_card");
  const total = active.reduce((s, a) => s + a.balanceCents, 0);
  const s = summary.data;
  const income = (s?.incomePostedCents ?? 0) + (s?.incomePlannedCents ?? 0);
  const expense = (s?.expensePostedCents ?? 0) + (s?.expensePlannedCents ?? 0);
  const catMap = byId(categories.data);
  const accMap = byId(accounts.data);
  const top = (s?.byCategory ?? []).slice(0, 6);
  const topMax = Math.max(1, ...top.map((c) => c.postedCents + c.plannedCents));
  const recentItems = (recent.data?.pages[0]?.items ?? []).filter((t) => t.status === "posted").slice(0, 6);
  const cards = (accounts.data ?? []).filter((a) => !a.archived && a.card);
  const overviews = useQueries({ queries: cards.map((c) => cardOverviewQuery(c.id)) });
  const monthEnd = `${month}-31`;
  // Faturas que vencem até o fim do mês saem do saldo das contas.
  const cardsDue = overviews.reduce(
    (sum, o) =>
      sum +
      (o.data?.pending ?? []).filter((p) => p.dueDate <= monthEnd).reduce((x, p) => x + p.remainingCents, 0),
    0,
  );
  // Aproximação até o painel da Fase 6: previstos do mês de todas as contas, menos faturas que vencem no mês.
  const projected = total + (s?.incomePlannedCents ?? 0) - (s?.expensePlannedCents ?? 0) - cardsDue;

  return (
    <>
      <div>
        <p className="text-sm text-muted">
          {WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}, {d} {MONTHS_SHORT[m - 1]}
        </p>
        <h2 className="text-[26px] font-semibold tracking-[-0.03em]">
          {greeting(hour)}
          {me?.name ? `, ${me.name.split(" ")[0]}` : ""}
        </h2>
      </div>

      {accounts.isSuccess && active.length === 0 ? (
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
            className="inline-flex h-10 items-center rounded-control bg-accent-fill px-4 font-medium text-on-accent"
          >
            Ir para Contas
          </Link>
        </Card>
      ) : (
        <>
          <div
            className={cn("grid gap-4", cards.length > 0 && "lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]")}
          >
            <Card className="flex flex-col gap-5 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[13px] font-medium text-muted">Saldo em contas</p>
                  <p className="num text-[clamp(30px,4.6vw,44px)] font-semibold leading-tight tracking-[-0.035em]">
                    {money(total)}
                  </p>
                  <p className="mt-1 text-[13px] text-muted">
                    Previsto para o fim de {monthShort(month)}:{" "}
                    <b className="num text-fg">{money(projected)}</b>
                    {cardsDue ? <span className="text-faint"> · já descontando as faturas</span> : null}
                  </p>
                </div>
                <Button size="sm" variant="primary" onClick={() => openNew()}>
                  Novo lançamento
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {active.map((a) => (
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
            {cards.length ? <StatementsCard cards={cards} /> : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="p-5">
              <p className="text-[13px] font-medium text-muted">Receitas · {monthShort(month)}</p>
              <p className="num mt-1 text-2xl font-semibold tracking-[-0.025em] text-accent">
                {money(s?.incomePostedCents ?? 0)}
              </p>
              <p className="mt-1 text-[13px] text-muted">
                {s?.incomePlannedCents ? `+ ${money(s.incomePlannedCents)} previsto` : "Nada previsto"}
              </p>
            </Card>
            <Card className="p-5">
              <p className="text-[13px] font-medium text-muted">Despesas · {monthShort(month)}</p>
              <p className="num mt-1 text-2xl font-semibold tracking-[-0.025em]">
                {money(s?.expensePostedCents ?? 0)}
              </p>
              <p className="mt-1 text-[13px] text-muted">
                {s?.expensePlannedCents ? `+ ${money(s.expensePlannedCents)} previsto` : "Nada previsto"}
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
              </div>
              <div className="flex flex-col gap-3.5 px-5 pt-4 pb-5">
                {top.length === 0 ? (
                  <p className="py-6 text-center text-muted">Nenhuma despesa neste mês.</p>
                ) : null}
                {top.map((row) => {
                  const cat = row.categoryId ? catMap.get(row.categoryId) : undefined;
                  const value = row.postedCents + row.plannedCents;
                  return (
                    <div key={row.categoryId ?? "none"} className="flex items-center gap-3">
                      <IconTile icon={cat?.icon} color={cat?.color} />
                      <div className="min-w-0 flex-1">
                        <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
                          <span className="truncate font-medium">{cat?.name ?? "Sem categoria"}</span>
                          <span className="num">
                            <b>{money(value)}</b>{" "}
                            <span className="text-faint">
                              {expense ? Math.round((value / expense) * 100) : 0}%
                            </span>
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${(value / topMax) * 100}%`,
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
                <h3 className="text-[15px] font-semibold">Últimos lançamentos</h3>
                <Link to="/lancamentos" className="text-sm font-medium text-accent hover:underline">
                  Ver todos
                </Link>
              </div>
              <div className="mt-2">
                {recentItems.length === 0 ? (
                  <p className="px-5 py-8 text-center text-muted">Nada lançado ainda.</p>
                ) : null}
                {recentItems.map((tx) => (
                  <TransactionRow key={tx.id} tx={tx} accounts={accMap} categories={catMap} showDate />
                ))}
              </div>
            </Card>
          </div>
        </>
      )}
    </>
  );
}
