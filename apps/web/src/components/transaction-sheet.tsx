import {
  addDays,
  formatBRL,
  parseQuickEntry,
  planInstallments,
  resolveQuickEntry,
  statementMonthFor,
  todayIn,
} from "@miu/core";
import type { Account, CreateTransaction, QuickSuggestion, Transaction, TransactionKind } from "@miu/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles, Trash2 } from "lucide-react";
import { useId, useRef, useState } from "react";
import {
  accountsQuery,
  categoriesQuery,
  createRecurring,
  deleteTransaction,
  invalidateMoney,
  suggestionsQuery,
  updateTransaction,
} from "@/lib/finance";
import { MONTHS, money, monthShort } from "@/lib/format";
import { ApiRequestError } from "@/lib/http";
import { meQuery } from "@/lib/me";
import { createOrQueue, removeQueued } from "@/lib/offline";
import { IconTile } from "./category-icon";
import { AmountInput, Chip, Segmented, Switch } from "./controls";
import { Sheet } from "./sheet";
import { toast } from "./toast";
import { Alert, Button, Field, Input } from "./ui";

export type Draft = {
  kind: TransactionKind;
  cents: number;
  accountId: string;
  toAccountId: string;
  categoryId: string;
  date: string;
  description: string;
  planned: boolean;
  installments: number;
  /** Compra antiga: parcelas já pagas (não são criadas). */
  installmentsPaid?: number;
  /** Criar como recorrência mensal a partir desta data. */
  repeat?: boolean;
  /** Pagamento de fatura: qual fatura (YYYY-MM). */
  statementMonth?: string | undefined;
};

type Props = {
  open: boolean;
  onClose: () => void;
  /** Lançamento sendo editado; sem ele, cria um novo. */
  editing?: Transaction | null;
  defaults?: Partial<Draft>;
};

const monthName = (ym: string) => MONTHS[Number(ym.slice(5, 7)) - 1] ?? ym;

export function TransactionSheet({ open, onClose, editing, defaults }: Props) {
  return (
    <Sheet open={open} onClose={onClose} title={editing ? "Editar lançamento" : "Novo lançamento"}>
      {open ? <TransactionForm onClose={onClose} editing={editing ?? null} defaults={defaults} /> : null}
    </Sheet>
  );
}

function TransactionForm({
  onClose,
  editing,
  defaults,
}: {
  onClose: () => void;
  editing: Transaction | null;
  defaults?: Partial<Draft> | undefined;
}) {
  const uid = useId();
  const queryClient = useQueryClient();
  const { data: me } = useQuery(meQuery);
  const { data: accounts = [] } = useQuery(accountsQuery);
  const { data: categories = [] } = useQuery(categoriesQuery);
  const today = todayIn(me?.settings.timezone);
  const banks = accounts.filter((a) => !a.archived && !a.card);
  const cards = accounts.filter((a) => !a.archived && a.card);
  const all = [...banks, ...cards];
  const { data: suggestions } = useQuery({ ...suggestionsQuery, enabled: !editing });
  const lastExpense = suggestions?.last.expense?.accountId;
  const usable = (id: string | undefined) => (id && all.some((a) => a.id === id) ? id : undefined);

  const [d, setD] = useState<Draft>(() =>
    editing
      ? {
          kind: editing.kind,
          cents: editing.amountCents,
          accountId: editing.accountId,
          toAccountId: editing.toAccountId ?? "",
          categoryId: editing.categoryId ?? "",
          date: editing.date,
          description: editing.description,
          planned: editing.status === "planned",
          installments: 1,
        }
      : {
          kind: "expense",
          cents: 0,
          accountId: usable(lastExpense) ?? banks[0]?.id ?? cards[0]?.id ?? "",
          toAccountId: (banks[1] ?? cards[0])?.id ?? "",
          categoryId: "",
          date: today,
          description: "",
          planned: false,
          installments: 1,
          ...defaults,
        },
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [quick, setQuick] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const quickRef = useRef<HTMLInputElement>(null);
  const again = useRef(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));

  const account = accounts.find((a) => a.id === d.accountId);
  const toAccount = accounts.find((a) => a.id === d.toAccountId);
  const onCard = Boolean(account?.card) && d.kind !== "transfer";
  const isInstallment = Boolean(editing?.installment);
  const future = d.date > today;
  const cats = categories.filter((c) => c.kind === (d.kind === "income" ? "income" : "expense"));
  const visibleCats = cats.filter((c) => !c.archived || c.id === d.categoryId);
  const parcelado = onCard && d.kind === "expense" && !editing && d.installments > 1;

  // Ao trocar o tipo, a conta escolhida precisa continuar válida (transferência não sai de cartão).
  function changeKind(kind: TransactionKind) {
    const patch: Partial<Draft> = { kind, categoryId: "", installments: 1 };
    if (kind === "transfer" && account?.card) patch.accountId = banks[0]?.id ?? "";
    set(patch);
  }

  const done = async (message: string, undo?: () => Promise<void>) => {
    await invalidateMoney(queryClient);
    toast(
      message,
      undo
        ? {
            label: "Desfazer",
            onClick: () => {
              void undo().then(async () => {
                await invalidateMoney(queryClient);
                toast("Lançamento desfeito");
              });
            },
          }
        : undefined,
    );
    if (again.current) {
      again.current = false;
      setQuick("");
      setHint(null);
      setErrors({});
      setD((x) => ({
        ...x,
        cents: 0,
        description: "",
        categoryId: "",
        installments: 1,
        date: today,
        repeat: false,
      }));
      quickRef.current?.focus();
      return;
    }
    onClose();
  };

  /** Linha mágica: interpreta o texto e preenche o formulário abaixo. */
  function applyQuick(text: string) {
    setQuick(text);
    if (!text.trim()) {
      setHint(null);
      return;
    }
    const p = parseQuickEntry(text, today);
    const r = resolveQuickEntry(p.words, {
      accounts: all.map((a) => ({ id: a.id, name: a.name, isCard: Boolean(a.card) })),
      categories: categories
        .filter((c) => !c.archived)
        .map((c) => ({ id: c.id, name: c.name, kind: c.kind as "expense" | "income" })),
      history: suggestions?.history ?? [],
    });
    const kind: TransactionKind = p.income
      ? "income"
      : (r.kind ?? (d.kind === "income" ? "income" : "expense"));
    const accountId =
      r.accountId && all.some((a) => a.id === r.accountId)
        ? r.accountId
        : kind === "income"
          ? (usable(suggestions?.last.income?.accountId) ?? banks[0]?.id ?? d.accountId)
          : d.kind === "transfer"
            ? (usable(lastExpense) ?? d.accountId)
            : d.accountId;
    const cat = categories.find((c) => c.id === r.categoryId && c.kind === kind);
    const acc = all.find((a) => a.id === accountId);
    setD((x) => ({
      ...x,
      kind,
      cents: p.amountCents ?? 0,
      description: r.description,
      categoryId: cat?.id ?? "",
      accountId,
      date: p.date,
      installments: p.installments && acc?.card && kind === "expense" ? p.installments : 1,
    }));
    const parts = [
      p.amountCents ? formatBRL(p.amountCents) : null,
      cat ? `${cat.name}${r.source === "history" ? " (do seu histórico)" : ""}` : null,
      acc?.name ?? null,
      p.date === today
        ? "hoje"
        : p.date === addDays(today, -1)
          ? "ontem"
          : p.date.split("-").reverse().join("/"),
      p.installments && acc?.card ? `em ${p.installments}x` : null,
    ].filter(Boolean);
    setHint(parts.join(" · "));
  }

  function pickSuggestion(sg: QuickSuggestion) {
    const value = sg.amountCents
      ? (sg.amountCents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })
      : "";
    const text = value ? `${value} ${sg.description}` : `${sg.description} `;
    applyQuick(text);
    requestAnimationFrame(() => {
      const el = quickRef.current;
      if (!el) return;
      el.focus();
      // sem valor salvo: cursor no começo para digitar o valor
      const pos = value ? text.length : 0;
      el.setSelectionRange(pos, pos);
    });
  }

  const save = useMutation({
    // Roda mesmo offline: createOrQueue decide entre enviar e guardar na fila (o TanStack pausaria).
    networkMode: "always",
    mutationFn: async () => {
      const status = d.planned || future ? ("planned" as const) : ("posted" as const);
      const fallback =
        d.kind === "transfer"
          ? toAccount?.card
            ? `Pagamento da fatura · ${toAccount.name}`
            : "Transferência"
          : (cats.find((c) => c.id === d.categoryId)?.name ?? "");
      const description = d.description.trim() || fallback;
      if (d.repeat && !editing) {
        const common = {
          amountCents: d.cents,
          accountId: d.accountId,
          description: description || "Recorrência",
          frequency: "monthly" as const,
          startDate: d.date,
          firstPosted: status === "posted",
        };
        await createRecurring(
          d.kind === "transfer"
            ? { kind: "transfer", toAccountId: d.toAccountId, ...common }
            : { kind: d.kind, categoryId: d.categoryId, ...common },
        );
        return { status } as { status: "posted" | "planned" };
      }
      if (editing) {
        return updateTransaction(editing.id, {
          amountCents: d.cents,
          ...(isInstallment ? {} : { accountId: d.accountId, date: d.date, status }),
          ...(d.kind === "transfer" ? { toAccountId: d.toAccountId } : { categoryId: d.categoryId }),
          description,
        });
      }
      // Lançamento novo: sem conexão, vai para a fila do aparelho (lib/offline.ts).
      const send = async (body: CreateTransaction) => {
        const r = await createOrQueue(body, me?.id ?? "");
        return r.queued ? { queued: true as const, clientId: r.clientId } : r.tx;
      };
      if (d.kind === "transfer") {
        return send({
          kind: "transfer",
          amountCents: d.cents,
          accountId: d.accountId,
          toAccountId: d.toAccountId,
          date: d.date,
          description,
          status,
          ...(d.statementMonth && toAccount?.card ? { statementMonth: d.statementMonth } : {}),
        });
      }
      return send({
        kind: d.kind,
        amountCents: d.cents,
        accountId: d.accountId,
        categoryId: d.categoryId,
        date: d.date,
        description,
        status,
        ...(parcelado
          ? { installments: d.installments, installmentsPaid: oldPurchase ? (d.installmentsPaid ?? 0) : 0 }
          : {}),
      });
    },
    onSuccess: (tx) =>
      "queued" in tx
        ? done("Sem internet: guardado no aparelho. Envia sozinho quando a conexão voltar.", async () =>
            removeQueued(tx.clientId),
          )
        : done(
            editing
              ? "Lançamento atualizado"
              : d.repeat
                ? "Salvo e repetindo todo mês"
                : parcelado
                  ? `Compra em ${d.installments}x salva`
                  : tx.status === "planned"
                    ? "Previsão salva"
                    : "Lançamento salvo",
            !editing && !d.repeat && "id" in tx && typeof tx.id === "string"
              ? () => deleteTransaction(tx.id as string, parcelado ? "following" : "one")
              : undefined,
          ),
  });

  const remove = useMutation({
    mutationFn: (scope: "one" | "following") => deleteTransaction(editing?.id ?? "", scope),
    onSuccess: (_, scope) => done(scope === "following" ? "Parcelas excluídas" : "Lançamento excluído"),
  });

  function submit() {
    const e: Record<string, string> = {};
    if (d.cents <= 0) e.amount = "Informe um valor maior que zero.";
    if (!d.accountId) e.account = "Escolha uma conta.";
    if (d.kind === "transfer" && (!d.toAccountId || d.toAccountId === d.accountId))
      e.to = "Escolha contas diferentes.";
    if (d.kind !== "transfer" && !d.categoryId) e.category = "Escolha uma categoria.";
    if (parcelado && d.cents < d.installments) e.amount = "Valor baixo demais para tantas parcelas.";
    setErrors(e);
    if (Object.keys(e).length === 0) save.mutate();
  }

  if (all.length === 0) {
    return <Alert tone="info">Crie uma conta primeiro, em Contas, para começar a lançar.</Alert>;
  }

  const error = save.error ?? remove.error;
  const statementHint =
    onCard && account?.card && !isInstallment
      ? (() => {
          const m = statementMonthFor(d.date, account.card.closingDay);
          return `Entra na fatura de ${monthName(m)} (fecha dia ${account.card.closingDay}).`;
        })()
      : null;
  // Compra cuja primeira parcela caiu numa fatura que já passou: provavelmente dívida antiga.
  const oldPurchase =
    parcelado && account?.card
      ? statementMonthFor(d.date, account.card.closingDay) < statementMonthFor(today, account.card.closingDay)
      : false;
  const plan =
    parcelado && account?.card && d.cents > 0
      ? planInstallments({
          totalCents: d.cents,
          count: d.installments,
          purchaseDate: d.date,
          closingDay: account.card.closingDay,
        }).filter((p) => p.no > (oldPurchase ? (d.installmentsPaid ?? 0) : 0))
      : null;

  return (
    <form
      className="flex flex-col gap-[18px]"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {!editing ? (
        <div className="flex flex-col gap-2">
          {suggestions?.frequent.length ? (
            <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
              {suggestions.frequent.map((sg) => {
                const c = categories.find((x) => x.id === sg.categoryId);
                return (
                  <button
                    key={sg.description}
                    type="button"
                    onClick={() => pickSuggestion(sg)}
                    className="flex shrink-0 items-center gap-2 rounded-full border border-line-strong bg-surface py-1 pr-3 pl-1 text-sm hover:bg-surface-2"
                  >
                    <IconTile
                      icon={c?.icon}
                      color={c?.color}
                      className="size-6 rounded-full [&_svg]:size-3.5"
                    />
                    <span className="max-w-[140px] truncate">{sg.description}</span>
                    {sg.amountCents ? <span className="num text-muted">{money(sg.amountCents)}</span> : null}
                  </button>
                );
              })}
            </div>
          ) : null}
          <div className="relative">
            <Sparkles
              className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-primary"
              aria-hidden
            />
            <input
              ref={quickRef}
              data-autofocus
              value={quick}
              onChange={(e) => applyQuick(e.target.value)}
              // biome-ignore lint/a11y/noAutofocus: lançar rápido começa por aqui
              autoFocus
              autoComplete="off"
              enterKeyHint="done"
              aria-label="Lançamento rápido"
              aria-describedby={`${uid}-quick`}
              placeholder="Ex.: 45 ifood · +3000 salário · 120 mercado ontem"
              className="h-12 w-full rounded-control border border-line-strong bg-surface-2 pr-3 pl-10 text-[16px] outline-none focus:border-primary focus:bg-surface"
            />
          </div>
          <p id={`${uid}-quick`} className="min-h-5 text-[13px] text-muted" aria-live="polite">
            {hint ? (
              <>
                Entendi: <span className="font-medium text-fg-2">{hint}</span>. Enter salva.
              </>
            ) : (
              "Escreva valor e descrição; o Miu completa categoria e conta pelo seu histórico."
            )}
          </p>
        </div>
      ) : null}

      <Segmented
        label="Tipo"
        value={d.kind}
        onChange={changeKind}
        options={[
          { value: "expense", label: "Despesa", disabled: !!editing && editing.kind !== "expense" },
          { value: "income", label: "Receita", disabled: !!editing && editing.kind !== "income" },
          {
            value: "transfer",
            label: toAccount?.card && d.kind === "transfer" ? "Pagar fatura" : "Transferência",
            disabled: (!!editing && editing.kind !== "transfer") || banks.length === 0 || all.length < 2,
          },
        ]}
      />

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${uid}-amt`} className="text-[13px] font-medium text-muted">
          {parcelado ? "Valor total da compra" : isInstallment ? "Valor desta parcela" : "Valor"}
        </label>
        <AmountInput
          id={`${uid}-amt`}
          cents={d.cents}
          onChange={(cents) => set({ cents })}
          invalid={!!errors.amount}
          autoFocus={!!editing}
        />
        {errors.amount ? <p className="text-[13px] text-danger">{errors.amount}</p> : null}
      </div>

      {d.kind === "transfer" ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="De" error={errors.account}>
            {(p) => (
              <AccountSelect
                {...p}
                value={d.accountId}
                onChange={(accountId) => set({ accountId })}
                groups={[["Contas", banks]]}
              />
            )}
          </Field>
          <Field
            label="Para"
            error={errors.to}
            hint={toAccount?.card ? "Pagamento da fatura: a conta cai e a fatura é baixada." : undefined}
          >
            {(p) => (
              <AccountSelect
                {...p}
                value={d.toAccountId}
                onChange={(toAccountId) => set({ toAccountId })}
                groups={[
                  ["Contas", banks],
                  ["Cartões (pagar fatura)", cards],
                ]}
              />
            )}
          </Field>
        </div>
      ) : (
        <Field
          label={d.kind === "income" ? "Entrou em" : "Pago com"}
          error={errors.account}
          hint={statementHint}
        >
          {(p) => (
            <AccountSelect
              {...p}
              disabled={isInstallment}
              value={d.accountId}
              onChange={(accountId) => set({ accountId, installments: 1 })}
              groups={[
                ["Contas", banks],
                [d.kind === "income" ? "Cartões (estorno)" : "Cartões", cards],
              ]}
            />
          )}
        </Field>
      )}

      {onCard && d.kind === "expense" && !editing ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-4">
            <span>
              <span className="block font-medium">Parcelar</span>
              <span className="block text-[13px] text-muted">Uma parcela em cada fatura</span>
            </span>
            <Switch
              checked={d.installments > 1}
              onChange={(v) => set({ installments: v ? 2 : 1 })}
              label="Parcelar"
            />
          </div>
          {d.installments > 1 ? (
            <Field label="Número de parcelas">
              {(p) => (
                <select
                  {...p}
                  value={d.installments}
                  onChange={(e) => set({ installments: Number(e.target.value) })}
                  className="h-[42px] w-full rounded-control border border-line-strong bg-surface px-3"
                >
                  {Array.from({ length: 47 }, (_, i) => i + 2).map((n) => (
                    <option key={n} value={n}>
                      {n}x
                    </option>
                  ))}
                </select>
              )}
            </Field>
          ) : null}
          {oldPurchase ? (
            <Field
              label="Parcelas já pagas"
              hint="Compra antiga: só as parcelas que faltam entram nas faturas."
            >
              {(p) => (
                <select
                  {...p}
                  value={d.installmentsPaid ?? 0}
                  onChange={(e) => set({ installmentsPaid: Number(e.target.value) })}
                  className="h-[42px] w-full rounded-control border border-line-strong bg-surface px-3"
                >
                  {Array.from({ length: d.installments }, (_, i) => i).map((n) => (
                    <option key={n} value={n}>
                      {n === 0 ? "Nenhuma" : `${n} de ${d.installments}`}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          ) : null}
          {plan && plan.length > 0 ? (
            <div className="rounded-[14px] bg-surface-2 px-3.5 py-3 text-[13.5px] text-fg-2">
              {plan.length}
              {plan.length < d.installments ? " parcelas restantes" : "x"} de{" "}
              <b className="num text-fg">{money(plan.at(-1)?.amountCents ?? 0)}</b>
              {plan[0] && plan[0].no === 1 && plan[0].amountCents !== plan.at(-1)?.amountCents
                ? ` (1ª de ${money(plan[0].amountCents)})`
                : ""}{" "}
              · da fatura de {monthName(plan[0]?.statementMonth ?? "")} até{" "}
              {monthShort(plan.at(-1)?.statementMonth ?? "")}
            </div>
          ) : null}
        </div>
      ) : null}

      {isInstallment && editing?.installment ? (
        <div className="rounded-[14px] bg-surface-2 px-3.5 py-3 text-[13.5px] text-fg-2">
          Parcela {editing.installment.no} de {editing.installment.total}
          {editing.statementMonth ? ` · fatura de ${monthName(editing.statementMonth)}` : ""}. Mudanças valem
          só para esta parcela.
        </div>
      ) : null}

      {d.kind !== "transfer" ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-muted">Categoria</span>
          <div className="flex flex-wrap gap-2">
            {visibleCats.map((c) => (
              <Chip
                key={c.id}
                color={c.color}
                pressed={d.categoryId === c.id}
                onClick={() => set({ categoryId: c.id })}
              >
                {c.name}
              </Chip>
            ))}
          </div>
          {errors.category ? <p className="text-[13px] text-danger">{errors.category}</p> : null}
        </div>
      ) : null}

      {!isInstallment ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-muted">{parcelado ? "Data da compra" : "Data"}</span>
          <div className="flex flex-wrap items-center gap-2">
            <Chip pressed={d.date === today} onClick={() => set({ date: today })}>
              Hoje
            </Chip>
            <Chip pressed={d.date === addDays(today, -1)} onClick={() => set({ date: addDays(today, -1) })}>
              Ontem
            </Chip>
            <input
              type="date"
              aria-label="Outra data"
              value={d.date}
              onChange={(e) => e.target.value && set({ date: e.target.value })}
              className="h-[34px] rounded-control border border-line-strong bg-surface px-2.5 text-sm"
            />
          </div>
        </div>
      ) : null}

      <Field label="Descrição">
        {(p) => (
          <Input
            {...p}
            value={d.description}
            maxLength={120}
            onChange={(e) => set({ description: e.target.value })}
            placeholder={
              d.kind === "transfer"
                ? toAccount?.card
                  ? "Ex.: Pagamento da fatura"
                  : "Ex.: Guardar na reserva"
                : d.kind === "income"
                  ? "Ex.: Salário"
                  : "Ex.: Mercado da semana"
            }
          />
        )}
      </Field>

      {!editing && !parcelado ? (
        <div className="flex items-center justify-between gap-4">
          <span>
            <span className="block font-medium">Repetir todo mês</span>
            <span className="block text-[13px] text-muted">
              Cria uma recorrência: os próximos meses entram como previstos.
            </span>
          </span>
          <Switch checked={!!d.repeat} onChange={(repeat) => set({ repeat })} label="Repetir todo mês" />
        </div>
      ) : null}

      {!isInstallment && !onCard ? (
        <div className="flex items-center justify-between gap-4">
          <span>
            <span className="block font-medium">
              {d.kind === "income" ? "Já recebi" : d.kind === "expense" ? "Já paguei" : "Já transferi"}
            </span>
            <span className="block text-[13px] text-muted">
              {future
                ? "Data futura: fica como previsto até o dia."
                : "Desligado, fica como previsto e não mexe no saldo."}
            </span>
          </span>
          <Switch
            checked={!d.planned && !future}
            disabled={future}
            onChange={(v) => set({ planned: !v })}
            label="Já realizado"
          />
        </div>
      ) : null}

      {error ? (
        <Alert>
          {error instanceof ApiRequestError ? error.message : "Não foi possível salvar. Tente de novo."}
        </Alert>
      ) : null}

      <div className="sticky -bottom-5 -mx-5 -mb-5 mt-auto flex flex-wrap items-center justify-end gap-2.5 border-t border-line bg-surface px-5 pt-3.5 pb-[calc(14px+env(safe-area-inset-bottom))]">
        {editing && confirmDelete ? (
          <>
            <div className="mr-auto min-w-0 text-sm">
              <b className="block">Excluir {isInstallment ? "parcela" : "este lançamento"}?</b>
              {isInstallment && editing.installment ? (
                <span className="text-muted">
                  Parcela {editing.installment.no} de {editing.installment.total}
                </span>
              ) : (
                <span className="text-muted">Não dá para desfazer.</span>
              )}
            </div>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Voltar
            </Button>
            {isInstallment ? (
              <Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate("following")}>
                Esta e as próximas
              </Button>
            ) : null}
            <Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate("one")}>
              {isInstallment ? "Só esta" : "Excluir"}
            </Button>
          </>
        ) : (
          <>
            {editing ? (
              <Button variant="danger" className="mr-auto" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="size-4" aria-hidden /> Excluir
              </Button>
            ) : null}
            {editing || d.repeat ? (
              <Button variant="ghost" onClick={onClose}>
                Cancelar
              </Button>
            ) : (
              <Button
                variant="ghost"
                disabled={save.isPending}
                onClick={() => {
                  again.current = true;
                  submit();
                }}
                title="Salva e já abre um novo lançamento"
              >
                Salvar e novo
              </Button>
            )}
            <Button type="submit" variant="primary" loading={save.isPending}>
              {editing
                ? "Salvar alterações"
                : parcelado
                  ? `Salvar em ${d.installments}x`
                  : "Salvar lançamento"}
            </Button>
          </>
        )}
      </div>
    </form>
  );
}

function AccountSelect({
  value,
  onChange,
  groups,
  invalid,
  disabled,
  ...rest
}: {
  id: string;
  value: string;
  onChange: (id: string) => void;
  groups: [string, Account[]][];
  invalid: boolean;
  disabled?: boolean;
  "aria-describedby"?: string;
}) {
  const nonEmpty = groups.filter(([, list]) => list.length > 0);
  return (
    <select
      {...rest}
      value={value}
      disabled={disabled}
      aria-invalid={invalid || undefined}
      onChange={(e) => onChange(e.target.value)}
      className="h-[42px] w-full rounded-control border border-line-strong bg-surface px-3 disabled:opacity-60 aria-invalid:border-danger"
    >
      {nonEmpty.length === 1
        ? nonEmpty[0]?.[1].map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))
        : nonEmpty.map(([label, list]) => (
            <optgroup key={label} label={label}>
              {list.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </optgroup>
          ))}
    </select>
  );
}
