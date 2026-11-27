import { addYearMonth } from "@miu/core";
import type { Account } from "@miu/shared";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Check, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useState } from "react";
import { AccountSheet } from "@/components/account-form";
import { IconTile } from "@/components/category-icon";
import { CardBrandMark, InstitutionLogo } from "@/components/institution-logo";
import { useQuickAdd } from "@/components/quick-add";
import { CardsSkeleton } from "@/components/skeletons";
import { StatusPill } from "@/components/status-pill";
import { byId, TransactionRow } from "@/components/transaction-row";
import { Button, Card } from "@/components/ui";
import { cn } from "@/lib/cn";
import { accountsQuery, cardOverviewQuery, categoriesQuery, statementQuery } from "@/lib/finance";
import { dayShort, MONTHS, money, monthShort } from "@/lib/format";
import { awaitData } from "@/lib/loaders";

export const Route = createFileRoute("/_app/cartoes")({
  validateSearch: (s: Record<string, unknown>): { id?: string | undefined; fatura?: string | undefined } => ({
    id: typeof s.id === "string" ? s.id : undefined,
    fatura: typeof s.fatura === "string" && /^\d{4}-\d{2}$/.test(s.fatura) ? s.fatura : undefined,
  }),
  loaderDeps: ({ search }) => ({ id: search.id }),
  loader: ({ context, deps }) => {
    const qc = context.queryClient;
    return awaitData([
      qc.ensureQueryData(accountsQuery),
      ...(deps.id ? [qc.ensureQueryData(cardOverviewQuery(deps.id))] : []),
    ]);
  },
  head: () => ({ meta: [{ title: "Cartões · Miu Controle" }] }),
  component: Cartoes,
  pendingComponent: CardsSkeleton,
});

function Cartoes() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { data: accounts = [], isPending } = useQuery(accountsQuery);
  const [creating, setCreating] = useState(false);
  const cards = accounts.filter((a) => a.card && !a.archived);
  const card = cards.find((c) => c.id === search.id) ?? cards[0];

  if (isPending) return <Card className="h-60 skeleton" />;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {cards.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-pressed={c.id === card?.id}
            onClick={() => navigate({ search: { id: c.id }, replace: true })}
            className={cn(
              "inline-flex h-[38px] items-center gap-2 rounded-full border px-3 text-sm",
              c.id === card?.id
                ? "border-primary bg-accent-soft text-fg"
                : "border-line-strong bg-surface text-fg-2",
            )}
          >
            <InstitutionLogo account={c} className="-ml-1.5 size-6 rounded-full" />
            {c.name}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex h-[34px] items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3 text-sm text-fg-2 hover:bg-surface-2"
        >
          <Plus className="size-4" aria-hidden /> Novo cartão
        </button>
      </div>

      {card ? (
        <CardView
          key={card.id}
          card={card}
          month={search.fatura}
          onMonth={(fatura) => navigate({ search: { id: card.id, fatura }, replace: true })}
        />
      ) : (
        <Card className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <h3 className="text-lg font-semibold">Nenhum cartão cadastrado</h3>
          <p className="max-w-md text-muted">
            Com o dia de fechamento e de vencimento, cada compra cai na fatura certa e as parcelas aparecem
            mês a mês.
          </p>
          <Button variant="primary" onClick={() => setCreating(true)}>
            Cadastrar cartão
          </Button>
        </Card>
      )}

      <AccountSheet
        open={creating}
        onClose={() => setCreating(false)}
        account={null}
        defaultKind="credit_card"
      />
    </>
  );
}

function CardView({
  card,
  month,
  onMonth,
}: {
  card: Account;
  month?: string | undefined;
  onMonth: (m: string) => void;
}) {
  const overview = useQuery(cardOverviewQuery(card.id));
  const current = month ?? overview.data?.focusMonth;
  const statement = useQuery({ ...statementQuery(card.id, current ?? ""), enabled: Boolean(current) });
  const { data: accounts } = useQuery(accountsQuery);
  const { data: categories } = useQuery(categoriesQuery);
  const { openNew } = useQuickAdd();
  const accMap = byId(accounts);
  const catMap = byId(categories);
  const banks = (accounts ?? []).filter((a) => !a.card && !a.archived);
  const o = overview.data;
  const s = statement.data;
  const upMax = Math.max(1, ...(o?.upcoming.map((u) => u.totalCents) ?? [1]));

  const pay = () =>
    s &&
    openNew({
      kind: "transfer",
      accountId: banks[0]?.id ?? "",
      toAccountId: card.id,
      cents: s.remainingCents,
      statementMonth: s.month,
      description: `Pagamento da fatura de ${MONTHS[Number(s.month.slice(5, 7)) - 1]} · ${card.name}`,
    });

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <fieldset className="inline-flex h-[38px] items-center rounded-control border border-line-strong bg-surface">
            <legend className="sr-only">Fatura</legend>
            <button
              type="button"
              aria-label="Fatura anterior"
              disabled={!current}
              onClick={() => current && onMonth(addYearMonth(current, -1))}
              className="grid h-9 w-[34px] place-items-center rounded-[9px] text-muted hover:bg-surface-2"
            >
              <ChevronLeft className="size-[18px]" />
            </button>
            <span className="min-w-[150px] text-center text-sm font-medium">
              {current ? `Fatura de ${MONTHS[Number(current.slice(5, 7)) - 1]}` : "…"}
              {current && current.slice(0, 4) !== String(new Date().getFullYear())
                ? ` ${current.slice(0, 4)}`
                : ""}
            </span>
            <button
              type="button"
              aria-label="Próxima fatura"
              disabled={!current}
              onClick={() => current && onMonth(addYearMonth(current, 1))}
              className="grid h-9 w-[34px] place-items-center rounded-[9px] text-muted hover:bg-surface-2"
            >
              <ChevronRight className="size-[18px]" />
            </button>
          </fieldset>
          {s ? <StatusPill status={s.status} /> : null}
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4 p-5">
          <div>
            <p className="text-[13px] font-medium text-muted">
              {s?.status === "paid"
                ? "Total da fatura"
                : s?.status === "open"
                  ? "Total até agora"
                  : "Valor a pagar"}
            </p>
            <p className="num text-[clamp(30px,4.6vw,44px)] font-semibold leading-tight tracking-[-0.035em]">
              {money(s ? (s.status === "paid" || s.status === "open" ? s.totalCents : s.remainingCents) : 0)}
            </p>
            {s ? (
              <p className="mt-1 text-[13px] text-muted">
                Fecha em {dayShort(s.closeDate)} · vence em {dayShort(s.dueDate)}
                {s.paidCents > 0 && s.status !== "paid" ? ` · ${money(s.paidCents)} já pago` : ""}
                {s.plannedCents ? ` · inclui ${money(s.plannedCents)} previsto` : ""}
              </p>
            ) : null}
          </div>
          {s && s.remainingCents > 0 && banks.length ? (
            <Button variant={s.status === "open" ? "secondary" : "primary"} onClick={pay}>
              <Check className="size-4" aria-hidden /> Pagar fatura
            </Button>
          ) : null}
        </div>

        <div className="border-t border-line">
          {statement.isPending ? <div className="h-24 skeleton" /> : null}
          {s && s.items.length === 0 ? (
            <p className="px-5 py-10 text-center text-muted">Nenhuma compra nesta fatura.</p>
          ) : null}
          {s?.items.map((tx) => (
            <TransactionRow key={tx.id} tx={tx} accounts={accMap} categories={catMap} showDate />
          ))}
        </div>
      </Card>

      <div className="flex flex-col gap-4">
        <div
          className="relative flex aspect-[1.586] max-w-full flex-col justify-between overflow-hidden rounded-2xl p-5 text-white shadow-lg"
          style={{
            background: `linear-gradient(135deg, ${card.color}, color-mix(in srgb, ${card.color} 50%, #000))`,
          }}
        >
          <div className="pointer-events-none absolute -top-[40%] -right-[30%] h-[120%] w-[90%] rounded-full bg-white/[0.07]" />
          <div className="relative flex items-center justify-between">
            <span className="flex min-w-0 items-center gap-2.5">
              {card.institution ? <InstitutionLogo account={card} className="size-8 ring-white/30" /> : null}
              <span className="truncate font-semibold tracking-tight">{card.name}</span>
            </span>
            <span className="h-[26px] w-[34px] shrink-0 rounded-md bg-gradient-to-br from-white/55 to-white/20" />
          </div>
          {card.cardBrand ? (
            <CardBrandMark brand={card.cardBrand} className="absolute right-5 bottom-5" />
          ) : null}
          <div className="relative">
            <p className="text-xs opacity-75">Limite disponível</p>
            <p className="num text-[26px] font-semibold tracking-[-0.03em]">
              {money(o?.availableCents ?? 0)}
            </p>
            <p className="text-xs opacity-75">
              de {money(o?.creditLimitCents ?? card.card?.creditLimitCents ?? 0)} · melhor dia de compra:{" "}
              {card.card?.closingDay}
            </p>
          </div>
        </div>

        <Card>
          <div className="flex items-center justify-between px-5 pt-4">
            <h3 className="text-[15px] font-medium text-muted">Próximas faturas</h3>
            <span className="text-xs text-faint">já comprometido</span>
          </div>
          <div className="flex flex-col gap-2.5 px-5 pt-4 pb-5">
            {o?.upcoming.map((u) => (
              <button
                key={u.month}
                type="button"
                onClick={() => onMonth(u.month)}
                className="flex items-center gap-2.5 text-left"
              >
                <span className="w-[52px] text-[13px] text-muted">{monthShort(u.month)}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <span
                    className="block h-full rounded-full"
                    style={{ width: `${(u.totalCents / upMax) * 100}%`, background: card.color }}
                  />
                </span>
                <b className="num min-w-[92px] text-right text-[13.5px]">{money(u.totalCents)}</b>
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <div className="px-5 pt-4">
            <h3 className="text-[15px] font-medium text-muted">Parcelamentos em andamento</h3>
          </div>
          <div className="mt-2">
            {o && o.installments.length === 0 ? (
              <p className="px-5 py-6 text-center text-sm text-muted">Nenhuma compra parcelada.</p>
            ) : null}
            {o?.installments.map((g) => {
              const cat = g.categoryId ? catMap.get(g.categoryId) : undefined;
              return (
                <div
                  key={g.groupId}
                  className="flex items-center gap-3 border-t border-line px-5 py-3 first:border-t-0"
                >
                  <IconTile icon={cat?.icon} color={cat?.color} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-medium">{g.description}</span>
                    <span className="text-[13px] text-muted">
                      {g.nextNo}/{g.total} · termina em {monthShort(g.lastMonth)}
                    </span>
                  </span>
                  <span className="num text-right">
                    <span className="block text-[14.5px] font-medium">
                      {money(g.perInstallmentCents)}/mês
                    </span>
                    <span className="text-xs text-muted">restam {money(g.remainingCents)}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
