import { todayIn } from "@miu/core";
import { FREQUENCY_LABEL, type Frequency, type RecurringRule } from "@miu/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useId, useState } from "react";
import {
  accountsQuery,
  categoriesQuery,
  createRecurring,
  deleteRecurring,
  invalidateMoney,
  updateRecurring,
} from "@/lib/finance";
import { ApiRequestError } from "@/lib/http";
import { meQuery } from "@/lib/me";
import { AmountInput, Chip, Segmented, Switch } from "./controls";
import { Sheet } from "./sheet";
import { toast } from "./toast";
import { Alert, Button, Field, Input } from "./ui";

type Kind = RecurringRule["kind"];

export function RecurringSheet({
  open,
  onClose,
  rule,
}: {
  open: boolean;
  onClose: () => void;
  rule: RecurringRule | null;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={rule ? "Editar recorrência" : "Nova recorrência"}>
      <RecurringForm rule={rule} onClose={onClose} />
    </Sheet>
  );
}

function RecurringForm({ rule, onClose }: { rule: RecurringRule | null; onClose: () => void }) {
  const uid = useId();
  const queryClient = useQueryClient();
  const { data: me } = useQuery(meQuery);
  const { data: accounts = [] } = useQuery(accountsQuery);
  const { data: categories = [] } = useQuery(categoriesQuery);
  const today = todayIn(me?.settings.timezone);
  const banks = accounts.filter((a) => !a.archived && !a.card);
  const cards = accounts.filter((a) => !a.archived && a.card);

  const [kind, setKind] = useState<Kind>(rule?.kind ?? "expense");
  const [cents, setCents] = useState(rule?.amountCents ?? 0);
  const [description, setDescription] = useState(rule?.description ?? "");
  const [accountId, setAccountId] = useState(rule?.accountId ?? banks[0]?.id ?? "");
  const [toAccountId, setToAccountId] = useState(rule?.toAccountId ?? banks[1]?.id ?? cards[0]?.id ?? "");
  const [categoryId, setCategoryId] = useState(rule?.categoryId ?? "");
  const [frequency, setFrequency] = useState<Frequency>(rule?.frequency ?? "monthly");
  const [interval, setInterval] = useState(rule?.interval ?? 1);
  const [startDate, setStartDate] = useState(rule?.startDate ?? today);
  const [endDate, setEndDate] = useState(rule?.endDate ?? "");
  const [autoPost, setAutoPost] = useState(rule?.autoPost ?? false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  const cats = categories.filter(
    (c) => c.kind === (kind === "income" ? "income" : "expense") && (!c.archived || c.id === categoryId),
  );
  const fromOptions = kind === "expense" ? [...banks, ...cards] : banks;
  const toOptions = [...banks, ...cards].filter((a) => a.id !== accountId);

  const done = async (msg: string) => {
    await invalidateMoney(queryClient);
    toast(msg);
    onClose();
  };

  const save = useMutation({
    mutationFn: async () => {
      const common = {
        amountCents: cents,
        accountId,
        description: description.trim(),
        frequency,
        interval,
        startDate,
        endDate: endDate || null,
        autoPost,
      };
      if (rule) {
        return updateRecurring(rule.id, {
          ...common,
          ...(kind === "transfer" ? { toAccountId } : { categoryId }),
        });
      }
      return createRecurring(
        kind === "transfer" ? { kind, toAccountId, ...common } : { kind, categoryId, ...common },
      );
    },
    onSuccess: () => done(rule ? "Recorrência atualizada" : "Recorrência criada"),
  });
  const remove = useMutation({
    mutationFn: () => deleteRecurring(rule?.id ?? ""),
    onSuccess: () => done("Recorrência excluída"),
  });

  function submit() {
    const e: Record<string, string> = {};
    if (cents <= 0) e.amount = "Informe um valor maior que zero.";
    if (!description.trim()) e.description = "Dê um nome, como Aluguel ou Salário.";
    if (kind !== "transfer" && !categoryId) e.category = "Escolha uma categoria.";
    if (kind === "transfer" && (!toAccountId || toAccountId === accountId))
      e.to = "Escolha contas diferentes.";
    if (endDate && endDate < startDate) e.end = "A data final precisa ser depois do início.";
    setErrors(e);
    if (Object.keys(e).length === 0) save.mutate();
  }

  const error = save.error ?? remove.error;
  const unit = frequency === "monthly" ? "meses" : frequency === "weekly" ? "semanas" : "anos";

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
        value={kind}
        onChange={(k) => {
          setKind(k);
          setCategoryId("");
          if (k !== "expense" && accounts.find((a) => a.id === accountId)?.card)
            setAccountId(banks[0]?.id ?? "");
        }}
        options={[
          { value: "expense", label: "Despesa", disabled: !!rule && rule.kind !== "expense" },
          { value: "income", label: "Receita", disabled: !!rule && rule.kind !== "income" },
          {
            value: "transfer",
            label: "Transferência",
            disabled: (!!rule && rule.kind !== "transfer") || banks.length === 0,
          },
        ]}
      />

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${uid}-amt`} className="text-[13px] font-medium text-muted">
          Valor de cada vez
        </label>
        <AmountInput
          id={`${uid}-amt`}
          cents={cents}
          onChange={setCents}
          invalid={!!errors.amount}
          autoFocus={!rule}
        />
        {errors.amount ? <p className="text-[13px] text-danger">{errors.amount}</p> : null}
      </div>

      <Field label="Nome" error={errors.description}>
        {(p) => (
          <Input
            {...p}
            value={description}
            maxLength={120}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={
              kind === "income"
                ? "Ex.: Salário"
                : kind === "transfer"
                  ? "Ex.: Guardar na reserva"
                  : "Ex.: Aluguel"
            }
          />
        )}
      </Field>

      <div className={kind === "transfer" ? "grid grid-cols-2 gap-3" : ""}>
        <Field label={kind === "income" ? "Entra em" : kind === "transfer" ? "De" : "Pago com"}>
          {(p) => (
            <select
              {...p}
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="h-[42px] w-full rounded-control border border-line-strong bg-surface px-3"
            >
              {fromOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {a.card ? " (cartão)" : ""}
                </option>
              ))}
            </select>
          )}
        </Field>
        {kind === "transfer" ? (
          <Field label="Para" error={errors.to}>
            {(p) => (
              <select
                {...p}
                value={toAccountId}
                onChange={(e) => setToAccountId(e.target.value)}
                className="h-[42px] w-full rounded-control border border-line-strong bg-surface px-3"
              >
                {toOptions.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
        ) : null}
      </div>

      {kind !== "transfer" ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-muted">Categoria</span>
          <div className="flex flex-wrap gap-2">
            {cats.map((c) => (
              <Chip
                key={c.id}
                color={c.color}
                pressed={categoryId === c.id}
                onClick={() => setCategoryId(c.id)}
              >
                {c.name}
              </Chip>
            ))}
          </div>
          {errors.category ? <p className="text-[13px] text-danger">{errors.category}</p> : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-muted">Repete</span>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            label="Frequência"
            value={frequency}
            onChange={setFrequency}
            options={(["monthly", "weekly", "yearly"] as const).map((f) => ({
              value: f,
              label: FREQUENCY_LABEL[f],
            }))}
          />
          <select
            aria-label="Intervalo"
            value={interval}
            onChange={(e) => setInterval(Number(e.target.value))}
            className="h-[38px] rounded-control border border-line-strong bg-surface px-2.5 text-sm"
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n === 1 ? "todo período" : `a cada ${n} ${unit}`}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field
          label={rule ? "Começou em" : "Primeira vez"}
          hint={
            frequency === "monthly"
              ? "O dia desta data é o dia de todo mês. Dia 31 vira o último dia em meses curtos."
              : undefined
          }
        >
          {(p) => (
            <input
              {...p}
              type="date"
              value={startDate}
              onChange={(e) => e.target.value && setStartDate(e.target.value)}
              className="h-[42px] w-full rounded-control border border-line-strong bg-surface px-3"
            />
          )}
        </Field>
        <Field label="Termina em (opcional)" error={errors.end}>
          {(p) => (
            <input
              {...p}
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-[42px] w-full rounded-control border border-line-strong bg-surface px-3"
            />
          )}
        </Field>
      </div>

      <div className="flex items-center justify-between gap-4">
        <span>
          <span className="block font-medium">Lançar sozinho no dia</span>
          <span className="block text-[13px] text-muted">
            Para débito automático. Desligado, fica como previsto até você confirmar.
          </span>
        </span>
        <Switch checked={autoPost} onChange={setAutoPost} label="Lançar sozinho no dia" />
      </div>

      {rule ? (
        <p className="text-[13px] text-muted">
          Mudanças valem daqui para frente: as previsões futuras são refeitas; o que já aconteceu não muda.
        </p>
      ) : null}

      {error ? (
        <Alert>
          {error instanceof ApiRequestError ? error.message : "Não foi possível salvar. Tente de novo."}
        </Alert>
      ) : null}

      <div className="sticky -bottom-5 -mx-5 -mb-5 mt-auto flex flex-wrap items-center justify-end gap-2.5 border-t border-line bg-surface px-5 pt-3.5 pb-[calc(14px+env(safe-area-inset-bottom))]">
        {rule && confirmDelete ? (
          <>
            <div className="mr-auto min-w-0 text-sm">
              <b className="block">Excluir esta recorrência?</b>
              <span className="text-muted">As previsões futuras somem; o que já aconteceu fica.</span>
            </div>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Voltar
            </Button>
            <Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>
              Excluir
            </Button>
          </>
        ) : (
          <>
            {rule ? (
              <Button variant="danger" className="mr-auto" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="size-4" aria-hidden /> Excluir
              </Button>
            ) : null}
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" loading={save.isPending}>
              {rule ? "Salvar" : "Criar recorrência"}
            </Button>
          </>
        )}
      </div>
    </form>
  );
}
