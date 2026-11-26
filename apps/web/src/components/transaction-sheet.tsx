import { addDays, planInstallments, statementMonthFor, todayIn } from "@miu/core";
import type { Account, Transaction, TransactionKind } from "@miu/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useId, useState } from "react";
import {
  accountsQuery,
  categoriesQuery,
  createRecurring,
  createTransaction,
  deleteTransaction,
  invalidateMoney,
  updateTransaction,
} from "@/lib/finance";
import { MONTHS, money, monthShort } from "@/lib/format";
import { ApiRequestError } from "@/lib/http";
import { meQuery } from "@/lib/me";
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
          accountId: banks[0]?.id ?? cards[0]?.id ?? "",
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

  const done = async (message: string) => {
    await invalidateMoney(queryClient);
    toast(message);
    onClose();
  };

  const save = useMutation({
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
      if (d.kind === "transfer") {
        return createTransaction({
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
      return createTransaction({
        kind: d.kind,
        amountCents: d.cents,
        accountId: d.accountId,
        categoryId: d.categoryId,
        date: d.date,
        description,
        status,
        ...(parcelado ? { installments: d.installments } : {}),
      });
    },
    onSuccess: (tx) =>
      done(
        editing
          ? "Lançamento atualizado"
          : d.repeat
            ? "Salvo e repetindo todo mês"
            : parcelado
              ? `Compra em ${d.installments}x salva`
              : tx.status === "planned"
                ? "Previsão salva"
                : "Lançamento salvo",
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
  const plan =
    parcelado && account?.card && d.cents > 0
      ? planInstallments({
          totalCents: d.cents,
          count: d.installments,
          purchaseDate: d.date,
          closingDay: account.card.closingDay,
        })
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
          autoFocus
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
          {plan && plan.length > 1 ? (
            <div className="rounded-xl border border-line bg-surface-2 px-3.5 py-3 text-[13.5px] text-fg-2">
              {plan.length}x de <b className="num text-fg">{money(plan[1]?.amountCents ?? 0)}</b>
              {plan[0]?.amountCents !== plan[1]?.amountCents
                ? ` (1ª de ${money(plan[0]?.amountCents ?? 0)})`
                : ""}{" "}
              · da fatura de {monthName(plan[0]?.statementMonth ?? "")} até{" "}
              {monthShort(plan.at(-1)?.statementMonth ?? "")}
            </div>
          ) : null}
        </div>
      ) : null}

      {isInstallment && editing?.installment ? (
        <div className="rounded-xl border border-line bg-surface-2 px-3.5 py-3 text-[13.5px] text-fg-2">
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

      {editing && confirmDelete ? (
        <div className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface-2 p-3.5 text-sm">
          <b>Excluir {isInstallment ? "parcela" : "este lançamento"}?</b>
          {isInstallment && editing.installment ? (
            <span className="text-muted">
              Esta é a parcela {editing.installment.no} de {editing.installment.total}.
            </span>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="danger"
              loading={remove.isPending}
              onClick={() => remove.mutate("one")}
            >
              {isInstallment ? "Só esta parcela" : "Excluir"}
            </Button>
            {isInstallment ? (
              <Button
                size="sm"
                variant="danger"
                loading={remove.isPending}
                onClick={() => remove.mutate("following")}
              >
                Esta e as próximas
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : null}

      <div className="sticky bottom-0 -mx-5 -mb-5 mt-auto flex flex-wrap justify-end gap-2.5 border-t border-line bg-surface px-5 pt-3.5 pb-[calc(14px+env(safe-area-inset-bottom))]">
        {editing && !confirmDelete ? (
          <Button variant="danger" className="mr-auto" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="size-4" aria-hidden /> Excluir
          </Button>
        ) : null}
        <Button variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" loading={save.isPending}>
          {editing ? "Salvar alterações" : parcelado ? `Salvar em ${d.installments}x` : "Salvar lançamento"}
        </Button>
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
