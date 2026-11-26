import { todayIn } from "@miu/core";
import type { Transaction } from "@miu/shared";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Search as SearchIcon } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { MonthSwitcher, Segmented } from "@/components/controls";
import { useQuickAdd } from "@/components/quick-add";
import { byId, TransactionRow } from "@/components/transaction-row";
import { Button, Card } from "@/components/ui";
import { accountsQuery, categoriesQuery, summaryQuery, transactionsQuery } from "@/lib/finance";
import { dayLong, dayShort, money } from "@/lib/format";
import { meQuery } from "@/lib/me";

type Filters = {
  mes?: string | undefined;
  conta?: string | undefined;
  tipo?: "income" | "expense" | "transfer" | undefined;
  situacao?: "posted" | "planned" | undefined;
};

const pick = <T extends string>(v: unknown, allowed: readonly T[]) =>
  typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;

export const Route = createFileRoute("/_app/lancamentos")({
  validateSearch: (s: Record<string, unknown>): Filters => ({
    mes: typeof s.mes === "string" && /^\d{4}-\d{2}$/.test(s.mes) ? s.mes : undefined,
    conta: typeof s.conta === "string" ? s.conta : undefined,
    tipo: pick(s.tipo, ["income", "expense", "transfer"] as const),
    situacao: pick(s.situacao, ["posted", "planned"] as const),
  }),
  head: () => ({ meta: [{ title: "Lançamentos · Miu Controle" }] }),
  component: Lancamentos,
});

function Lancamentos() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { data: me } = useQuery(meQuery);
  const today = todayIn(me?.settings.timezone);
  const month = search.mes ?? today.slice(0, 7);
  const [q, setQ] = useState("");
  const deferredQ = useDeferredValue(q.trim());
  const { openNew } = useQuickAdd();

  const setSearch = (patch: Partial<Filters>) =>
    navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });

  const accounts = useQuery(accountsQuery);
  const categories = useQuery(categoriesQuery);
  const summary = useQuery(summaryQuery(month));
  const list = useInfiniteQuery(
    transactionsQuery({
      month,
      accountId: search.conta,
      kind: search.tipo,
      status: search.situacao,
      q: deferredQ || undefined,
    }),
  );

  const accMap = byId(accounts.data);
  const catMap = byId(categories.data);
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const groups = groupByDate(items);
  const filtered = Boolean(search.conta || search.tipo || search.situacao || deferredQ);

  const s = summary.data;
  const income = (s?.incomePostedCents ?? 0) + (s?.incomePlannedCents ?? 0);
  const expense = (s?.expensePostedCents ?? 0) + (s?.expensePlannedCents ?? 0);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthSwitcher
          month={month}
          onChange={(mes) => {
            setSearch({ mes });
            window.scrollTo({ top: 0 });
          }}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          label="Receitas"
          value={money(income)}
          sub={`${money(s?.incomePlannedCents ?? 0)} previsto`}
          tone="pos"
        />
        <Stat
          label="Despesas"
          value={money(expense)}
          sub={`${money(s?.expensePlannedCents ?? 0)} previsto`}
        />
        <Stat
          label="Resultado"
          value={money(income - expense)}
          sub="Transferências não entram na conta"
          tone={income - expense < 0 ? "neg" : undefined}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[220px] flex-1">
          <SearchIcon
            className="pointer-events-none absolute top-1/2 left-3 size-[18px] -translate-y-1/2 text-faint"
            aria-hidden
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por descrição"
            aria-label="Buscar lançamentos"
            className="h-[42px] w-full rounded-control border border-line-strong bg-surface pr-3 pl-[38px] outline-none focus:border-accent"
          />
        </div>
        <Segmented
          label="Tipo"
          value={search.tipo ?? "all"}
          onChange={(v) => setSearch({ tipo: v === "all" ? undefined : v })}
          options={[
            { value: "all", label: "Todos" },
            { value: "expense", label: "Despesas" },
            { value: "income", label: "Receitas" },
            { value: "transfer", label: "Transferências" },
          ]}
        />
        <select
          aria-label="Conta"
          value={search.conta ?? ""}
          onChange={(e) => setSearch({ conta: e.target.value || undefined })}
          className="h-[42px] rounded-control border border-line-strong bg-surface px-3"
        >
          <option value="">Todas as contas</option>
          {accounts.data?.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Situação"
          value={search.situacao ?? ""}
          onChange={(e) => setSearch({ situacao: (e.target.value || undefined) as Filters["situacao"] })}
          className="h-[42px] rounded-control border border-line-strong bg-surface px-3"
        >
          <option value="">Realizado e previsto</option>
          <option value="posted">Só realizado</option>
          <option value="planned">Só previsto</option>
        </select>
      </div>

      {list.isPending ? (
        <Card className="h-40 animate-pulse" aria-label="Carregando" />
      ) : items.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 px-6 py-12 text-center text-muted">
          {filtered ? (
            <>
              <p>Nenhum lançamento com esses filtros.</p>
              <Button
                size="sm"
                onClick={() => {
                  setQ("");
                  setSearch({ conta: undefined, tipo: undefined, situacao: undefined });
                }}
              >
                Limpar filtros
              </Button>
            </>
          ) : (
            <>
              <p>Nada lançado em {month === today.slice(0, 7) ? "este mês" : "neste mês"} ainda.</p>
              <Button size="sm" variant="primary" onClick={() => openNew()}>
                Novo lançamento
              </Button>
            </>
          )}
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map(([date, txs]) => {
            const net = txs.reduce(
              (n, t) => n + (t.kind === "income" ? t.amountCents : t.kind === "expense" ? -t.amountCents : 0),
              0,
            );
            const label = dayLong(date, today);
            return (
              <Card key={date}>
                <div className="flex items-center justify-between border-b border-line px-5 py-3">
                  <span className="text-sm font-semibold">
                    {label}
                    {label.includes(",") ? null : (
                      <span className="ml-1.5 font-normal text-faint">{dayShort(date)}</span>
                    )}
                  </span>
                  <span className="num text-[13px] text-muted">
                    {net >= 0 ? "+ " : "− "}
                    {money(Math.abs(net))}
                  </span>
                </div>
                {txs.map((tx) => (
                  <TransactionRow key={tx.id} tx={tx} accounts={accMap} categories={catMap} />
                ))}
              </Card>
            );
          })}
          {list.hasNextPage ? (
            <Button
              onClick={() => list.fetchNextPage()}
              loading={list.isFetchingNextPage}
              className="self-center"
            >
              Carregar mais
            </Button>
          ) : null}
        </div>
      )}
    </>
  );
}

function groupByDate(items: Transaction[]) {
  const map = new Map<string, Transaction[]>();
  for (const t of items) map.set(t.date, [...(map.get(t.date) ?? []), t]);
  return [...map];
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "pos" | "neg" | undefined;
}) {
  return (
    <Card className="p-5">
      <p className="text-[13px] font-medium text-muted">{label}</p>
      <p
        className={
          tone === "pos"
            ? "num mt-1 text-2xl font-semibold tracking-[-0.025em] text-accent"
            : tone === "neg"
              ? "num mt-1 text-2xl font-semibold tracking-[-0.025em] text-danger"
              : "num mt-1 text-2xl font-semibold tracking-[-0.025em]"
        }
      >
        {value}
      </p>
      <p className="mt-1 text-[13px] text-muted">{sub}</p>
    </Card>
  );
}
