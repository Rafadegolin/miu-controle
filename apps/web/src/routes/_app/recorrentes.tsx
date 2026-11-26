import { addYearMonth, todayIn } from "@miu/core";
import { describeFrequency, type RecurringRule } from "@miu/shared";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarClock, Plus } from "lucide-react";
import { useState } from "react";
import { IconTile } from "@/components/category-icon";
import { Switch } from "@/components/controls";
import { RecurringSheet } from "@/components/recurring-sheet";
import { toast } from "@/components/toast";
import { byId, TransactionRow } from "@/components/transaction-row";
import { Button, Card } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  accountsQuery,
  categoriesQuery,
  invalidateMoney,
  pauseRecurring,
  recurringQuery,
  transactionsQuery,
} from "@/lib/finance";
import { dayShort, money, signedMoney } from "@/lib/format";
import { meQuery } from "@/lib/me";

export const Route = createFileRoute("/_app/recorrentes")({
  head: () => ({ meta: [{ title: "Recorrentes · Miu Controle" }] }),
  component: Recorrentes,
});

function Recorrentes() {
  const { data: me } = useQuery(meQuery);
  const today = todayIn(me?.settings.timezone);
  const month = today.slice(0, 7);
  const rules = useQuery(recurringQuery);
  const { data: accounts } = useQuery(accountsQuery);
  const { data: categories } = useQuery(categoriesQuery);
  const thisMonth = useInfiniteQuery(transactionsQuery({ month, status: "planned" }));
  const nextMonth = useInfiniteQuery(transactionsQuery({ month: addYearMonth(month, 1), status: "planned" }));
  const [sheet, setSheet] = useState<{ open: boolean; rule: RecurringRule | null }>({
    open: false,
    rule: null,
  });

  const accMap = byId(accounts);
  const catMap = byId(categories);
  const active = (rules.data ?? []).filter((r) => !r.paused);
  const income = active.filter((r) => r.kind === "income").reduce((s, r) => s + r.monthlyCents, 0);
  const expense = active.filter((r) => r.kind === "expense").reduce((s, r) => s + r.monthlyCents, 0);
  const upcoming = [...(thisMonth.data?.pages ?? []), ...(nextMonth.data?.pages ?? [])]
    .flatMap((p) => p.items)
    .filter((t) => t.source === "recurring")
    .sort((a, b) => a.date.localeCompare(b.date));
  const overdue = upcoming.filter((t) => t.date < today);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-[13px] font-medium text-muted">Receitas fixas por mês</p>
          <p className="num mt-1 text-2xl font-semibold tracking-[-0.025em] text-accent">{money(income)}</p>
        </Card>
        <Card className="p-5">
          <p className="text-[13px] font-medium text-muted">Despesas fixas por mês</p>
          <p className="num mt-1 text-2xl font-semibold tracking-[-0.025em]">{money(expense)}</p>
        </Card>
        <Card className="p-5">
          <p className="text-[13px] font-medium text-muted">Sobra antes do dia a dia</p>
          <p
            className={cn(
              "num mt-1 text-2xl font-semibold tracking-[-0.025em]",
              income - expense < 0 && "text-danger",
            )}
          >
            {money(income - expense)}
          </p>
          <p className="mt-1 text-[13px] text-muted">
            {income
              ? `${Math.round((expense / income) * 100)}% da renda fixa já tem destino`
              : "Cadastre seu salário para ver a proporção"}
          </p>
        </Card>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3 text-[13.5px] text-fg-2">
        <CalendarClock className="mt-0.5 size-[18px] shrink-0 text-muted" aria-hidden />
        <span>
          Cada regra cria lançamentos <b>previstos</b> para as próximas semanas. Eles entram no saldo
          previsto, mas só mexem no saldo de verdade quando você confirma (ou sozinhos, se a regra estiver em
          "lançar sozinho").
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card>
          <div className="flex items-center justify-between px-5 pt-4">
            <h3 className="text-[15px] font-semibold">Regras</h3>
            <Button size="sm" variant="primary" onClick={() => setSheet({ open: true, rule: null })}>
              <Plus className="size-4" aria-hidden /> Nova recorrência
            </Button>
          </div>
          <div className="mt-3">
            {rules.isPending ? <div className="h-24 animate-pulse" /> : null}
            {rules.data?.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-10 text-center text-muted">
                <p>Cadastre o que se repete: salário, aluguel, internet, assinaturas.</p>
                <p className="text-[13px]">Você também pode marcar "repetir" ao fazer um lançamento.</p>
              </div>
            ) : null}
            {rules.data?.map((r) => (
              <RuleRow
                key={r.id}
                rule={r}
                onEdit={() => setSheet({ open: true, rule: r })}
                accountName={accMap.get(r.accountId)?.name ?? ""}
                category={r.categoryId ? catMap.get(r.categoryId) : undefined}
              />
            ))}
          </div>
        </Card>

        <Card>
          <div className="px-5 pt-4">
            <h3 className="text-[15px] font-semibold">Previstos</h3>
            {overdue.length ? (
              <p className="mt-1 text-[13px] text-warn">
                {overdue.length === 1
                  ? "1 previsão já passou da data"
                  : `${overdue.length} previsões já passaram da data`}
                : confirme ou exclua.
              </p>
            ) : null}
          </div>
          <div className="mt-2">
            {upcoming.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted">Nada previsto.</p>
            ) : null}
            {upcoming.map((tx) => (
              <TransactionRow key={tx.id} tx={tx} accounts={accMap} categories={catMap} showDate />
            ))}
          </div>
        </Card>
      </div>

      <RecurringSheet
        open={sheet.open}
        rule={sheet.rule}
        onClose={() => setSheet((s) => ({ ...s, open: false }))}
      />
    </>
  );
}

function RuleRow({
  rule: r,
  onEdit,
  accountName,
  category,
}: {
  rule: RecurringRule;
  onEdit: () => void;
  accountName: string;
  category?: { icon: Parameters<typeof IconTile>[0]["icon"]; color: string } | undefined;
}) {
  const queryClient = useQueryClient();
  const toggle = useMutation({
    mutationFn: () => pauseRecurring(r.id, !r.paused),
    onSuccess: async () => {
      await invalidateMoney(queryClient);
      toast(r.paused ? "Recorrência retomada" : "Recorrência pausada");
    },
  });
  return (
    <div className="flex items-center border-t border-line first:border-t-0 hover:bg-surface-2">
      <button
        type="button"
        onClick={onEdit}
        className="flex min-w-0 flex-1 items-center gap-3 px-5 py-3 text-left"
      >
        <IconTile icon={category?.icon} color={category?.color} transfer={r.kind === "transfer"} />
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate text-[14.5px] font-medium", r.paused && "text-muted")}>
            {r.description}
          </span>
          <span className="block truncate text-[13px] text-muted">
            {describeFrequency(r)} · {accountName}
            {r.paused ? " · pausada" : r.nextDate ? ` · próxima ${dayShort(r.nextDate)}` : " · encerrada"}
            {r.autoPost && !r.paused ? " · automática" : ""}
          </span>
        </span>
        <span
          className={cn(
            "num text-right text-[15px] font-semibold whitespace-nowrap",
            r.kind === "income" ? "text-accent" : r.kind === "transfer" ? "text-muted" : "text-fg",
            r.paused && "opacity-50",
          )}
        >
          {signedMoney(r.amountCents, r.kind)}
        </span>
      </button>
      <span className="pr-5">
        <Switch
          checked={!r.paused}
          disabled={toggle.isPending}
          onChange={() => toggle.mutate()}
          label={r.paused ? `Retomar ${r.description}` : `Pausar ${r.description}`}
        />
      </span>
    </div>
  );
}
