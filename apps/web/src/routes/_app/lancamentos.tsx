import { todayIn } from "@miu/core";
import type { Account, Category, Transaction } from "@miu/shared";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Check, Search as SearchIcon, Tag, Trash2, X } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { CategoryBadge, IconTile } from "@/components/category-icon";
import { MonthSwitcher, Segmented } from "@/components/controls";
import { InstitutionLogo } from "@/components/institution-logo";
import { useQuickAdd } from "@/components/quick-add";
import { toast } from "@/components/toast";
import { byId, TransactionRow } from "@/components/transaction-row";
import { Button, Card } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  accountsQuery,
  bulkTransactions,
  categoriesQuery,
  confirmTransaction,
  invalidateMoney,
  summaryQuery,
  transactionsQuery,
} from "@/lib/finance";
import { dayLong, dayShort, money, signedMoney } from "@/lib/format";
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

const control = "h-[42px] rounded-control border border-line-strong bg-surface px-3";

function Lancamentos() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { data: me } = useQuery(meQuery);
  const today = todayIn(me?.settings.timezone);
  const month = search.mes ?? today.slice(0, 7);
  const [q, setQ] = useState("");
  const deferredQ = useDeferredValue(q.trim());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { openNew } = useQuickAdd();

  const setSearch = (patch: Partial<Filters>) => {
    setSelected(new Set());
    return navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });
  };

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
  // Só conta o que ainda está na lista (depois de excluir ou filtrar).
  const selectedIds = items.filter((t) => selected.has(t.id)).map((t) => t.id);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allSelected = items.length > 0 && selectedIds.length === items.length;
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(items.map((t) => t.id)));

  const s = summary.data;
  const income = (s?.incomePostedCents ?? 0) + (s?.incomePlannedCents ?? 0);
  const expense = (s?.expensePostedCents ?? 0) + (s?.expensePlannedCents ?? 0);
  const count = list.data?.pages[0] ? items.length + (list.hasNextPage ? "+" : "") : "…";

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

      <Card className="grid grid-cols-2 gap-y-4 p-5 lg:grid-cols-4 lg:divide-x lg:divide-line">
        <Stat label="Lançamentos" value={String(count)} sub={filtered ? "com os filtros" : "no mês"} />
        <Stat
          label="Entradas"
          value={money(income)}
          sub={`${money(s?.incomePlannedCents ?? 0)} previsto`}
          tone="pos"
        />
        <Stat label="Saídas" value={money(expense)} sub={`${money(s?.expensePlannedCents ?? 0)} previsto`} />
        <Stat
          label="Resultado"
          value={money(income - expense)}
          sub="sem transferências"
          tone={income - expense < 0 ? "neg" : undefined}
        />
      </Card>

      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[220px] flex-1">
          <SearchIcon
            className="pointer-events-none absolute top-1/2 left-3 size-[18px] -translate-y-1/2 text-faint"
            aria-hidden
          />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSelected(new Set());
            }}
            placeholder="Buscar por descrição"
            aria-label="Buscar lançamentos"
            className={cn(control, "w-full pl-[38px] outline-none focus:border-primary")}
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
          className={control}
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
          className={control}
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
              <p>Nada lançado neste mês ainda.</p>
              <Button size="sm" variant="primary" onClick={() => openNew()}>
                Novo lançamento
              </Button>
            </>
          )}
        </Card>
      ) : (
        <>
          {/* Computador: tabela com seleção */}
          <Card className="hidden overflow-hidden lg:block">
            <table className="w-full table-fixed text-left">
              <thead>
                <tr className="border-b border-line text-[13px] text-muted">
                  <th className="w-12 py-3 pl-5">
                    <Checkbox
                      checked={allSelected}
                      indeterminate={selectedIds.length > 0 && !allSelected}
                      onChange={toggleAll}
                      label="Selecionar todos"
                    />
                  </th>
                  <th className="py-3 pr-3 font-medium">Descrição</th>
                  <th className="w-[200px] py-3 pr-3 font-medium">Categoria</th>
                  <th className="w-[170px] py-3 pr-3 font-medium">Conta</th>
                  <th className="w-[84px] py-3 pr-3 font-medium">Data</th>
                  <th className="w-[150px] py-3 pr-3 text-right font-medium">Valor</th>
                  <th className="w-14 py-3 pr-4" aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {items.map((tx) => (
                  <TableRow
                    key={tx.id}
                    tx={tx}
                    accounts={accMap}
                    categories={catMap}
                    selected={selected.has(tx.id)}
                    onToggle={() => toggle(tx.id)}
                  />
                ))}
              </tbody>
            </table>
          </Card>

          {/* Celular: lista por dia */}
          <div className="flex flex-col gap-4 lg:hidden">
            {groups.map(([date, txs]) => {
              const net = txs.reduce(
                (n, t) =>
                  n + (t.kind === "income" ? t.amountCents : t.kind === "expense" ? -t.amountCents : 0),
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
          </div>

          {list.hasNextPage ? (
            <Button
              onClick={() => list.fetchNextPage()}
              loading={list.isFetchingNextPage}
              className="self-center"
            >
              Carregar mais
            </Button>
          ) : null}
        </>
      )}

      {selectedIds.length > 0 ? (
        <BulkBar
          ids={selectedIds}
          categories={categories.data ?? []}
          onClear={() => setSelected(new Set())}
        />
      ) : null}
    </>
  );
}

/* ---------- linha da tabela ---------- */

function TableRow({
  tx,
  accounts,
  categories,
  selected,
  onToggle,
}: {
  tx: Transaction;
  accounts: Map<string, Account>;
  categories: Map<string, Category>;
  selected: boolean;
  onToggle: () => void;
}) {
  const { openEdit } = useQuickAdd();
  const queryClient = useQueryClient();
  const confirm = useMutation({
    mutationFn: () => confirmTransaction(tx.id),
    onSuccess: async () => {
      await invalidateMoney(queryClient);
      toast(`Confirmado: ${tx.description}`);
    },
  });
  const cat = tx.categoryId ? categories.get(tx.categoryId) : undefined;
  const account = accounts.get(tx.accountId);
  const from = account?.name ?? "Conta";
  const to = tx.toAccountId ? (accounts.get(tx.toAccountId)?.name ?? "Conta") : "";
  const planned = tx.status === "planned";
  const transfer = tx.kind === "transfer";

  return (
    <tr
      className={cn(
        "group cursor-pointer border-t border-line first:border-t-0 hover:bg-surface-2",
        selected && "bg-accent-soft hover:bg-accent-soft",
      )}
      onClick={() => openEdit(tx)}
    >
      <td className="py-3 pl-5" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        <Checkbox checked={selected} onChange={onToggle} label={`Selecionar ${tx.description}`} />
      </td>
      <td className="py-3 pr-3">
        <div className="flex min-w-0 items-center gap-3">
          <IconTile icon={cat?.icon} color={cat?.color} transfer={transfer} className="size-8" />
          <button
            type="button"
            className={cn("truncate text-left text-[15px] font-medium", planned && "text-fg-2")}
            onClick={(e) => {
              e.stopPropagation();
              openEdit(tx);
            }}
          >
            {tx.description}
          </button>
          {tx.installment ? (
            <span className="num shrink-0 rounded-full bg-surface-2 px-2 text-xs text-muted">
              {tx.installment.no}/{tx.installment.total}
            </span>
          ) : null}
          {planned ? (
            <span className="shrink-0 rounded-full border border-dashed border-line-strong px-2 text-xs text-muted">
              Previsto
            </span>
          ) : null}
        </div>
      </td>
      <td className="py-3 pr-3">
        {transfer ? (
          <CategoryBadge name="Transferência" transfer />
        ) : (
          <CategoryBadge icon={cat?.icon} color={cat?.color} name={cat?.name ?? "Sem categoria"} />
        )}
      </td>
      <td className="py-3 pr-3 text-sm text-fg-2">
        <span className="flex min-w-0 items-center gap-2">
          {account ? <InstitutionLogo account={account} className="size-5 rounded-[6px]" /> : null}
          <span className="truncate">{transfer ? `${from} → ${to}` : from}</span>
        </span>
      </td>
      <td className="num py-3 pr-3 text-sm text-muted">{dayShort(tx.date)}</td>
      <td
        className={cn(
          "num py-3 pr-3 text-right text-[15px] font-semibold whitespace-nowrap",
          tx.kind === "income" ? "text-accent" : transfer ? "text-muted" : "text-fg",
        )}
      >
        {signedMoney(tx.amountCents, tx.kind)}
      </td>
      <td
        className="py-3 pr-4 text-right"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {planned ? (
          <button
            type="button"
            onClick={() => confirm.mutate()}
            disabled={confirm.isPending}
            className="grid size-8 place-items-center rounded-lg border border-line-strong bg-surface hover:bg-surface-2"
            aria-label={`Confirmar ${tx.description}`}
            title="Confirmar: aconteceu"
          >
            <Check className="size-4" aria-hidden />
          </button>
        ) : null}
      </td>
    </tr>
  );
}

function Checkbox({
  checked,
  indeterminate,
  onChange,
  label,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={checked}
      ref={(el) => {
        if (el) el.indeterminate = Boolean(indeterminate);
      }}
      onChange={onChange}
      className="size-[18px] cursor-pointer accent-primary align-middle"
    />
  );
}

/* ---------- barra de ações em lote ---------- */

function BulkBar({
  ids,
  categories,
  onClear,
}: {
  ids: string[];
  categories: Category[];
  onClear: () => void;
}) {
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const n = ids.length;
  const plural = (k: number) => (k === 1 ? "lançamento" : "lançamentos");
  const run = useMutation({
    mutationFn: bulkTransactions,
    onSuccess: async (r, body) => {
      await invalidateMoney(queryClient);
      if (body.action === "delete")
        toast(`${r.changed} ${plural(r.changed)} excluído${r.changed === 1 ? "" : "s"}`);
      else
        toast(
          r.skipped
            ? `Categoria trocada em ${r.changed}; ${r.skipped} de outro tipo ficaram como estavam`
            : `Categoria trocada em ${r.changed} ${plural(r.changed)}`,
        );
      setConfirmDelete(false);
      onClear();
    },
    onError: () => toast("Não deu para concluir. Tente de novo."),
  });
  const active = categories.filter((c) => !c.archived);
  const expense = active.filter((c) => c.kind === "expense");
  const income = active.filter((c) => c.kind === "income");

  return (
    <div
      role="toolbar"
      aria-label="Ações nos lançamentos selecionados"
      className="fixed bottom-6 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-[18px] bg-fg py-2 pr-2 pl-4 text-bg shadow-pop lg:left-[calc(50%+132px)]"
    >
      <span className="text-sm font-medium whitespace-nowrap">
        {n} {n === 1 ? "selecionado" : "selecionados"}
      </span>
      <span className="mx-1 h-6 w-px bg-[color-mix(in_srgb,var(--bg)_25%,transparent)]" aria-hidden />
      {confirmDelete ? (
        <>
          <span className="px-1 text-sm whitespace-nowrap">
            Excluir {n} {plural(n)}?
          </span>
          <button
            type="button"
            disabled={run.isPending}
            onClick={() => run.mutate({ action: "delete", ids })}
            className="h-9 rounded-[12px] bg-danger px-3 text-sm font-medium text-white"
          >
            Excluir
          </button>
          <button
            type="button"
            onClick={() => setConfirmDelete(false)}
            className="h-9 rounded-[12px] px-3 text-sm hover:bg-[color-mix(in_srgb,var(--bg)_12%,transparent)]"
          >
            Voltar
          </button>
        </>
      ) : (
        <>
          <label className="relative flex h-9 items-center gap-1.5 rounded-[12px] px-3 text-sm hover:bg-[color-mix(in_srgb,var(--bg)_12%,transparent)]">
            <Tag className="size-4" aria-hidden />
            Mudar categoria
            <select
              aria-label="Nova categoria"
              value=""
              disabled={run.isPending}
              onChange={(e) => {
                if (e.target.value) run.mutate({ action: "set-category", ids, categoryId: e.target.value });
              }}
              className="absolute inset-0 cursor-pointer opacity-0"
            >
              <option value="">Escolha…</option>
              <optgroup label="Despesas">
                {expense.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Receitas">
                {income.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="flex h-9 items-center gap-1.5 rounded-[12px] px-3 text-sm hover:bg-[color-mix(in_srgb,var(--bg)_12%,transparent)]"
          >
            <Trash2 className="size-4" aria-hidden />
            Excluir
          </button>
        </>
      )}
      <button
        type="button"
        onClick={onClear}
        aria-label="Limpar seleção"
        className="grid size-9 place-items-center rounded-[12px] hover:bg-[color-mix(in_srgb,var(--bg)_12%,transparent)]"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}

/* ---------- auxiliares ---------- */

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
    <div className="lg:px-5 lg:first:pl-0">
      <p className="text-[13px] font-medium text-muted">{label}</p>
      <p
        className={cn(
          "num-display mt-1 text-[28px]",
          tone === "pos" && "text-accent",
          tone === "neg" && "text-danger",
        )}
      >
        {value}
      </p>
      <p className="mt-0.5 text-[13px] text-muted">{sub}</p>
    </div>
  );
}
