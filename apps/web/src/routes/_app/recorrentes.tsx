import { addYearMonth, todayIn } from "@miu/core";
import {
  type Account,
  describeFrequency,
  type InstallmentPlan,
  type RecurringRule,
  type RecurringYear,
} from "@miu/shared";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useState } from "react";
import { IconTile } from "@/components/category-icon";
import { Switch } from "@/components/controls";
import { InstitutionLogo } from "@/components/institution-logo";
import { RecurringSheet } from "@/components/recurring-sheet";
import { toast } from "@/components/toast";
import { byId, TransactionRow } from "@/components/transaction-row";
import { Button, Card, CardTitle } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  accountsQuery,
  categoriesQuery,
  invalidateMoney,
  pauseRecurring,
  recurringQuery,
  recurringYearQuery,
  transactionsQuery,
} from "@/lib/finance";
import { dayShort, MONTHS, MONTHS_SHORT, money, monthShort, signedMoney } from "@/lib/format";
import { meQuery } from "@/lib/me";

export const Route = createFileRoute("/_app/recorrentes")({
  head: () => ({ meta: [{ title: "Recorrentes · Miu Controle" }] }),
  component: Recorrentes,
});

const INSTALLMENTS = "var(--primary)";
const FIXED = "var(--accent-fill)";

function Recorrentes() {
  const { data: me } = useQuery(meQuery);
  const today = todayIn(me?.settings.timezone);
  const month = today.slice(0, 7);
  const [year, setYear] = useState(Number(today.slice(0, 4)));
  const [selected, setSelected] = useState(month);
  const yearData = useQuery(recurringYearQuery(year));
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
  const all = rules.data ?? [];
  const active = all.filter((r) => !r.paused);
  const income = active.filter((r) => r.kind === "income").reduce((s, r) => s + r.monthlyCents, 0);
  const expense = active.filter((r) => r.kind === "expense").reduce((s, r) => s + r.monthlyCents, 0);
  const upcoming = [...(thisMonth.data?.pages ?? []), ...(nextMonth.data?.pages ?? [])]
    .flatMap((p) => p.items)
    .filter((t) => t.source === "recurring")
    .sort((a, b) => a.date.localeCompare(b.date));
  const overdue = upcoming.filter((t) => t.date < today);
  // Contas fixas na ordem do calendário (próxima data), pausadas e encerradas no fim.
  const sortedRules = [...all].sort(
    (a, b) =>
      Number(a.paused || !a.nextDate) - Number(b.paused || !b.nextDate) ||
      (a.nextDate ?? "").localeCompare(b.nextDate ?? "") ||
      a.description.localeCompare(b.description),
  );

  const changeYear = (d: number) => {
    const y = year + d;
    setYear(y);
    setSelected(y === Number(today.slice(0, 4)) ? month : `${y}-01`);
  };

  return (
    <>
      <Card className="flex flex-col gap-5 p-5">
        <CardTitle
          aside={
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => changeYear(-1)}
                aria-label="Ano anterior"
                className="grid size-8 place-items-center rounded-control text-muted hover:bg-surface-2 hover:text-fg"
              >
                <ChevronLeft className="size-4" />
              </button>
              <span className="num w-12 text-center font-semibold text-fg">{year}</span>
              <button
                type="button"
                onClick={() => changeYear(1)}
                aria-label="Próximo ano"
                className="grid size-8 place-items-center rounded-control text-muted hover:bg-surface-2 hover:text-fg"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          }
        >
          Compromissos do ano
        </CardTitle>
        {yearData.data ? (
          <YearChart data={yearData.data} selected={selected} onSelect={setSelected} current={month} />
        ) : (
          <div className="h-[260px] animate-pulse rounded-[14px] bg-surface-2" />
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <InstallmentsCard plans={yearData.data?.installments} catMap={catMap} accMap={accMap} />

        <Card className="flex flex-col py-5">
          <div className="px-5">
            <CardTitle
              aside={
                <Button size="sm" variant="primary" onClick={() => setSheet({ open: true, rule: null })}>
                  <Plus className="size-4" aria-hidden /> Nova
                </Button>
              }
            >
              Contas fixas
            </CardTitle>
            <div className="mt-3 grid grid-cols-3 gap-3 rounded-[14px] bg-surface-2 px-4 py-3">
              <Mini label="Entram/mês" value={money(income)} tone="pos" />
              <Mini label="Saem/mês" value={money(expense)} />
              <Mini
                label="Sobra"
                value={money(income - expense)}
                tone={income - expense < 0 ? "neg" : undefined}
              />
            </div>
          </div>
          <div className="mt-2">
            {rules.isPending ? <div className="mx-5 h-24 animate-pulse rounded-[14px] bg-surface-2" /> : null}
            {rules.data?.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-10 text-center text-muted">
                <p>Cadastre o que se repete: salário, aluguel, internet, assinaturas.</p>
                <p className="text-[13px]">Você também pode marcar "repetir" ao fazer um lançamento.</p>
              </div>
            ) : null}
            {sortedRules.map((r) => (
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
      </div>

      <Card className="py-5">
        <div className="px-5">
          <CardTitle>Previstos das próximas semanas</CardTitle>
          {overdue.length ? (
            <p className="mt-1 text-[13px] text-warn">
              {overdue.length === 1
                ? "1 previsão já passou da data"
                : `${overdue.length} previsões já passaram da data`}
              : confirme ou exclua.
            </p>
          ) : (
            <p className="mt-1 text-[13px] text-muted">
              Entram no saldo previsto; mexem no saldo de verdade quando você confirma.
            </p>
          )}
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

      <RecurringSheet
        open={sheet.open}
        rule={sheet.rule}
        onClose={() => setSheet((s) => ({ ...s, open: false }))}
      />
    </>
  );
}

/* ---------- gráfico do ano ---------- */

function YearChart({
  data,
  selected,
  onSelect,
  current,
}: {
  data: RecurringYear;
  selected: string;
  onSelect: (m: string) => void;
  current: string;
}) {
  const max = Math.max(1, ...data.months.map((m) => m.installmentsCents + m.fixedCents));
  const sel = data.months.find((m) => m.month === selected) ?? data.months[0];
  const total = data.months.reduce((s, m) => s + m.installmentsCents + m.fixedCents, 0);
  if (!sel) return null;
  const selMonth = Number(sel.month.slice(5, 7));

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <div className="min-w-0 flex-1">
        <div className="flex h-[220px] items-end gap-1.5 sm:gap-2.5">
          {data.months.map((m) => {
            const sum = m.installmentsCents + m.fixedCents;
            const isSel = m.month === sel.month;
            const past = m.month < current;
            return (
              <button
                key={m.month}
                type="button"
                onClick={() => onSelect(m.month)}
                aria-pressed={isSel}
                aria-label={`${MONTHS[Number(m.month.slice(5, 7)) - 1]}: ${money(sum)}`}
                className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2"
              >
                <span
                  className={cn(
                    "flex w-full max-w-[38px] flex-col justify-end overflow-hidden rounded-[8px] transition-opacity",
                    !isSel && "opacity-45 group-hover:opacity-80",
                    past && !isSel && "opacity-25",
                  )}
                  style={{ height: `${Math.max(sum > 0 ? 4 : 0, (sum / max) * 100)}%` }}
                >
                  <span
                    className="block w-full"
                    style={{ height: `${(m.fixedCents / (sum || 1)) * 100}%`, background: FIXED }}
                  />
                  <span
                    className="block w-full"
                    style={{
                      height: `${(m.installmentsCents / (sum || 1)) * 100}%`,
                      background: INSTALLMENTS,
                    }}
                  />
                </span>
                <span
                  className={cn(
                    "text-[12px]",
                    isSel ? "font-semibold text-fg" : "text-muted",
                    m.month === current && !isSel && "text-primary",
                  )}
                >
                  {MONTHS_SHORT[Number(m.month.slice(5, 7)) - 1]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-4 rounded-[16px] bg-surface-2 p-4 lg:w-[260px]">
        <div>
          <p className="text-[13px] text-muted">{MONTHS[selMonth - 1]}</p>
          <p className="num-display text-[30px]">{money(sel.installmentsCents + sel.fixedCents)}</p>
          <p className="text-[13px] text-muted">já comprometidos</p>
        </div>
        <div className="flex flex-col gap-2.5 text-sm">
          <Legend color={INSTALLMENTS} label="Parcelas" value={sel.installmentsCents} />
          <Legend color={FIXED} label="Contas fixas" value={sel.fixedCents} />
        </div>
        <p className="mt-auto border-t border-line pt-3 text-[13px] text-muted">
          No ano: <b className="num text-fg">{money(total)}</b>. No cartão, conta o mês da fatura.
        </p>
      </div>
    </div>
  );
}

function Legend({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="size-2.5 rounded-full" style={{ background: color }} aria-hidden />
      <span className="flex-1 text-fg-2">{label}</span>
      <span className="num font-medium">{money(value)}</span>
    </div>
  );
}

/* ---------- parcelas ---------- */

function InstallmentsCard({
  plans,
  catMap,
  accMap,
}: {
  plans: InstallmentPlan[] | undefined;
  catMap: Map<string, { icon: Parameters<typeof IconTile>[0]["icon"]; color: string }>;
  accMap: Map<string, Account>;
}) {
  const remaining = (plans ?? []).reduce((s, p) => s + p.remainingCents, 0);
  return (
    <Card className="flex flex-col py-5">
      <div className="px-5">
        <CardTitle>Parcelas</CardTitle>
        {plans?.length ? (
          <p className="mt-1 text-[13px] text-muted">
            Faltam <b className="num text-fg">{money(remaining)}</b> em {plans.length}{" "}
            {plans.length === 1 ? "parcelamento" : "parcelamentos"}
          </p>
        ) : null}
      </div>
      {!plans ? <div className="mx-5 mt-3 h-24 animate-pulse rounded-[14px] bg-surface-2" /> : null}
      {plans?.length === 0 ? (
        <p className="px-6 py-10 text-center text-sm text-muted">
          Nenhuma compra parcelada em andamento. Ao lançar uma compra, escolha em quantas vezes.
        </p>
      ) : null}
      <ul className="mt-2">
        {plans?.map((p) => {
          const cat = p.categoryId ? catMap.get(p.categoryId) : undefined;
          const pct = (p.paidCount / p.total) * 100;
          return (
            <li
              key={p.groupId}
              className="flex items-center gap-3 border-t border-line px-5 py-3 first:border-t-0"
            >
              <IconTile icon={cat?.icon} color={cat?.color} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="truncate text-[15px] font-medium">{p.description}</span>
                  <span className="num ml-auto shrink-0 text-[15px] font-semibold">
                    {money(p.perInstallmentCents)}
                    <span className="font-normal text-muted">/mês</span>
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-2.5">
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                    <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                  </span>
                  <span className="num shrink-0 text-xs text-muted">
                    {p.paidCount}/{p.total}
                  </span>
                </div>
                <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-muted">
                  {accMap.get(p.accountId) ? (
                    <InstitutionLogo
                      account={accMap.get(p.accountId) as Account}
                      className="size-4 rounded-[4px]"
                    />
                  ) : null}
                  {accMap.get(p.accountId)?.name ?? "Conta"} · termina em {monthShort(p.lastMonth)} · faltam{" "}
                  <span className="num">{money(p.remainingCents)}</span>
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/* ---------- contas fixas ---------- */

function Mini({ label, value, tone }: { label: string; value: string; tone?: "pos" | "neg" | undefined }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted">{label}</p>
      <p
        className={cn(
          "num truncate text-[15px] font-semibold",
          tone === "pos" && "text-accent",
          tone === "neg" && "text-danger",
        )}
      >
        {value}
      </p>
    </div>
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
        <span
          className={cn(
            "num flex w-10 shrink-0 flex-col items-center rounded-[10px] bg-surface-2 py-1 leading-tight",
            r.paused && "opacity-50",
          )}
          aria-hidden
        >
          {r.nextDate ? (
            <>
              <span className="text-[15px] font-semibold">{Number(r.nextDate.slice(8, 10))}</span>
              <span className="text-[11px] text-muted">
                {MONTHS_SHORT[Number(r.nextDate.slice(5, 7)) - 1]}
              </span>
            </>
          ) : (
            <span className="py-1 text-xs text-muted">—</span>
          )}
        </span>
        <IconTile
          icon={category?.icon}
          color={category?.color}
          transfer={r.kind === "transfer"}
          className="size-8"
        />
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
