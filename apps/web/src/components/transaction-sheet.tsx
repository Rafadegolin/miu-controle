import { addDays, todayIn } from "@miu/core";
import type { Transaction, TransactionKind } from "@miu/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useId, useState } from "react";
import {
  accountsQuery,
  categoriesQuery,
  createTransaction,
  deleteTransaction,
  invalidateMoney,
  updateTransaction,
} from "@/lib/finance";
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
};

type Props = {
  open: boolean;
  onClose: () => void;
  /** Lançamento sendo editado; sem ele, cria um novo. */
  editing?: Transaction | null;
  defaults?: Partial<Draft>;
};

export function TransactionSheet({ open, onClose, editing, defaults }: Props) {
  // Remonta o formulário a cada abertura para começar do zero.
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
  const active = accounts.filter((a) => !a.archived && a.kind !== "credit_card");

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
        }
      : {
          kind: "expense",
          cents: 0,
          accountId: active[0]?.id ?? "",
          toAccountId: active[1]?.id ?? "",
          categoryId: "",
          date: today,
          description: "",
          planned: false,
          ...defaults,
        },
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));

  const future = d.date > today;
  const cats = categories.filter((c) => c.kind === (d.kind === "income" ? "income" : "expense"));
  const visibleCats = cats.filter((c) => !c.archived || c.id === d.categoryId);

  const done = async (message: string) => {
    await invalidateMoney(queryClient);
    toast(message);
    onClose();
  };

  const save = useMutation({
    mutationFn: async () => {
      const status = d.planned || future ? ("planned" as const) : ("posted" as const);
      const fallback =
        d.kind === "transfer" ? "Transferência" : (cats.find((c) => c.id === d.categoryId)?.name ?? "");
      const description = d.description.trim() || fallback;
      if (editing) {
        return updateTransaction(editing.id, {
          amountCents: d.cents,
          accountId: d.accountId,
          ...(d.kind === "transfer" ? { toAccountId: d.toAccountId } : { categoryId: d.categoryId }),
          date: d.date,
          description,
          status,
        });
      }
      return createTransaction(
        d.kind === "transfer"
          ? {
              kind: "transfer",
              amountCents: d.cents,
              accountId: d.accountId,
              toAccountId: d.toAccountId,
              date: d.date,
              description,
              status,
            }
          : {
              kind: d.kind,
              amountCents: d.cents,
              accountId: d.accountId,
              categoryId: d.categoryId,
              date: d.date,
              description,
              status,
            },
      );
    },
    onSuccess: (tx) =>
      done(
        editing ? "Lançamento atualizado" : tx.status === "planned" ? "Previsão salva" : "Lançamento salvo",
      ),
  });

  const remove = useMutation({
    mutationFn: () => deleteTransaction(editing?.id ?? ""),
    onSuccess: () => done("Lançamento excluído"),
  });

  function submit() {
    const e: Record<string, string> = {};
    if (d.cents <= 0) e.amount = "Informe um valor maior que zero.";
    if (!d.accountId) e.account = "Escolha uma conta.";
    if (d.kind === "transfer" && (!d.toAccountId || d.toAccountId === d.accountId))
      e.to = "Escolha contas diferentes.";
    if (d.kind !== "transfer" && !d.categoryId) e.category = "Escolha uma categoria.";
    setErrors(e);
    if (Object.keys(e).length === 0) save.mutate();
  }

  if (active.length === 0) {
    return <Alert tone="info">Crie uma conta primeiro, em Contas, para começar a lançar.</Alert>;
  }

  const error = save.error ?? remove.error;

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
        onChange={(kind) => set({ kind, categoryId: "" })}
        options={[
          { value: "expense", label: "Despesa", disabled: !!editing && editing.kind !== "expense" },
          { value: "income", label: "Receita", disabled: !!editing && editing.kind !== "income" },
          {
            value: "transfer",
            label: "Transferência",
            disabled: (!!editing && editing.kind !== "transfer") || active.length < 2,
          },
        ]}
      />

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${uid}-amt`} className="text-[13px] font-medium text-muted">
          Valor
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
                accounts={active}
              />
            )}
          </Field>
          <Field label="Para" error={errors.to}>
            {(p) => (
              <AccountSelect
                {...p}
                value={d.toAccountId}
                onChange={(toAccountId) => set({ toAccountId })}
                accounts={active}
              />
            )}
          </Field>
        </div>
      ) : (
        <Field label={d.kind === "income" ? "Entrou em" : "Saiu de"} error={errors.account}>
          {(p) => (
            <AccountSelect
              {...p}
              value={d.accountId}
              onChange={(accountId) => set({ accountId })}
              accounts={active}
            />
          )}
        </Field>
      )}

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

      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-muted">Data</span>
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

      <Field label="Descrição">
        {(p) => (
          <Input
            {...p}
            value={d.description}
            maxLength={120}
            onChange={(e) => set({ description: e.target.value })}
            placeholder={
              d.kind === "transfer"
                ? "Ex.: Guardar na reserva"
                : d.kind === "income"
                  ? "Ex.: Salário"
                  : "Ex.: Mercado da semana"
            }
          />
        )}
      </Field>

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

      {error ? (
        <Alert>
          {error instanceof ApiRequestError ? error.message : "Não foi possível salvar. Tente de novo."}
        </Alert>
      ) : null}

      {editing && confirmDelete ? (
        <div className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface-2 p-3.5 text-sm">
          <b>Excluir este lançamento?</b>
          <div className="flex gap-2">
            <Button size="sm" variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>
              Excluir
            </Button>
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
          {editing ? "Salvar alterações" : "Salvar lançamento"}
        </Button>
      </div>
    </form>
  );
}

function AccountSelect({
  value,
  onChange,
  accounts,
  invalid,
  ...rest
}: {
  id: string;
  value: string;
  onChange: (id: string) => void;
  accounts: { id: string; name: string }[];
  invalid: boolean;
  "aria-describedby"?: string;
}) {
  return (
    <select
      {...rest}
      value={value}
      aria-invalid={invalid || undefined}
      onChange={(e) => onChange(e.target.value)}
      className="h-[42px] w-full rounded-control border border-line-strong bg-surface px-3 aria-invalid:border-danger"
    >
      {accounts.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
        </option>
      ))}
    </select>
  );
}
