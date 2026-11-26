import { formatBRL, parseBRL } from "@miu/core";
import { ACCOUNT_KIND_LABEL, ACCOUNT_KINDS, type Account, type AccountKind, PALETTE } from "@miu/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { archiveAccount, createAccount, deleteAccount, invalidateMoney, updateAccount } from "@/lib/finance";
import { ApiRequestError } from "@/lib/http";
import { Chip } from "./controls";
import { Sheet } from "./sheet";
import { toast } from "./toast";
import { Alert, Button, Field, Input } from "./ui";

const centsText = (c: number) => formatBRL(c).replace("-R$ ", "-").replace("R$ ", "");

export function AccountSheet({
  open,
  onClose,
  account,
  defaultKind,
}: {
  open: boolean;
  onClose: () => void;
  account: Account | null;
  defaultKind?: AccountKind;
}) {
  const card = account?.kind === "credit_card" || (!account && defaultKind === "credit_card");
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={account ? (card ? "Editar cartão" : "Editar conta") : card ? "Novo cartão" : "Nova conta"}
    >
      {open ? (
        <AccountForm account={account} defaultKind={defaultKind ?? "checking"} onDone={onClose} />
      ) : null}
    </Sheet>
  );
}

function AccountForm({
  account,
  defaultKind,
  onDone,
}: {
  account: Account | null;
  defaultKind: AccountKind;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<AccountKind>(account?.kind ?? defaultKind);
  const isCard = kind === "credit_card";
  const [name, setName] = useState(account?.name ?? "");
  const [color, setColor] = useState(account?.color ?? (isCard ? "#3a4644" : PALETTE[0]));
  const [balance, setBalance] = useState(
    account && !account.card ? centsText(account.initialBalanceCents) : "",
  );
  const [limit, setLimit] = useState(account?.card ? centsText(account.card.creditLimitCents) : "");
  const [closingDay, setClosingDay] = useState(String(account?.card?.closingDay ?? ""));
  const [dueDay, setDueDay] = useState(String(account?.card?.dueDay ?? ""));
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  const finish = async (message: string) => {
    await invalidateMoney(queryClient);
    toast(message);
    onDone();
  };
  const onError = (e: unknown) =>
    setError(e instanceof ApiRequestError ? e.message : "Não foi possível salvar.");
  const fail = (mensagem: string) => new ApiRequestError(400, { erro: "dados_invalidos", mensagem });

  const save = useMutation({
    mutationFn: async () => {
      if (isCard) {
        const creditLimitCents = parseBRL(limit || "0");
        const c = Number(closingDay);
        const d = Number(dueDay);
        if (creditLimitCents === null || creditLimitCents < 0) throw fail("Digite o limite como 5.000,00.");
        if (!Number.isInteger(c) || c < 1 || c > 28) throw fail("O dia de fechamento vai de 1 a 28.");
        if (!Number.isInteger(d) || d < 1 || d > 28) throw fail("O dia de vencimento vai de 1 a 28.");
        return account
          ? updateAccount(account.id, {
              name: name.trim(),
              color,
              creditLimitCents,
              closingDay: c,
              dueDay: d,
            })
          : createAccount({
              name: name.trim(),
              kind: "credit_card",
              color,
              creditLimitCents,
              closingDay: c,
              dueDay: d,
            });
      }
      const initialBalanceCents = balance.trim() ? parseBRL(balance) : 0;
      if (initialBalanceCents === null) throw fail("Digite o saldo como 1.234,56.");
      return account
        ? updateAccount(account.id, { name: name.trim(), color, initialBalanceCents })
        : createAccount({
            name: name.trim(),
            kind: kind as Exclude<AccountKind, "credit_card">,
            color,
            initialBalanceCents,
          });
    },
    onSuccess: () => finish(account ? "Alterações salvas" : isCard ? "Cartão criado" : "Conta criada"),
    onError,
  });
  const archive = useMutation({
    mutationFn: () => archiveAccount(account?.id ?? "", !account?.archived),
    onSuccess: () => finish(account?.archived ? "Reativado" : "Arquivado"),
    onError,
  });
  const remove = useMutation({
    mutationFn: () => deleteAccount(account?.id ?? ""),
    onSuccess: () => finish("Excluído"),
    onError: (e) => {
      setConfirm(false);
      onError(e);
    },
  });

  return (
    <form
      className="flex flex-col gap-[18px]"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return setError(isCard ? "Dê um nome para o cartão." : "Dê um nome para a conta.");
        setError(null);
        save.mutate();
      }}
    >
      {!account ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-muted">Tipo</span>
          <div className="flex flex-wrap gap-2">
            {ACCOUNT_KINDS.map((k) => (
              <Chip key={k} pressed={kind === k} onClick={() => setKind(k)}>
                {ACCOUNT_KIND_LABEL[k]}
              </Chip>
            ))}
          </div>
        </div>
      ) : null}
      <Field label="Nome">
        {(p) => (
          <Input
            {...p}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={isCard ? "Ex.: Cartão do banco X" : "Ex.: Conta do banco X"}
            maxLength={60}
          />
        )}
      </Field>

      {isCard ? (
        <>
          <Field label="Limite total">
            {(p) => (
              <Input
                {...p}
                inputMode="decimal"
                className="num"
                placeholder="5.000,00"
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
              />
            )}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Dia que a fatura fecha">
              {(p) => (
                <Input
                  {...p}
                  type="number"
                  min={1}
                  max={28}
                  value={closingDay}
                  onChange={(e) => setClosingDay(e.target.value)}
                />
              )}
            </Field>
            <Field label="Dia que vence">
              {(p) => (
                <Input
                  {...p}
                  type="number"
                  min={1}
                  max={28}
                  value={dueDay}
                  onChange={(e) => setDueDay(e.target.value)}
                />
              )}
            </Field>
          </div>
          <p className="-mt-2 text-[13px] text-muted">
            Compras feitas a partir do dia de fechamento vão para a fatura do mês seguinte, como no banco.
            Veja os dois dias no app do cartão.
          </p>
        </>
      ) : (
        <Field
          label={account ? "Saldo inicial" : "Saldo de hoje"}
          hint={
            account
              ? "O saldo de quando você cadastrou a conta. O saldo atual é calculado a partir dele."
              : "Olhe no app do banco. Pode ser negativo."
          }
        >
          {(p) => (
            <Input
              {...p}
              inputMode="decimal"
              className="num"
              placeholder="0,00"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
            />
          )}
        </Field>
      )}

      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-muted">Cor</span>
        <div className="flex flex-wrap gap-2">
          {PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Cor ${c}`}
              aria-pressed={color === c}
              onClick={() => setColor(c)}
              className={cn("size-8 rounded-full border-2", color === c ? "border-fg" : "border-transparent")}
              style={{ background: c }}
            />
          ))}
        </div>
      </div>

      {error ? <Alert>{error}</Alert> : null}

      {account ? (
        <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface-2 p-3.5 text-sm">
          {confirm ? (
            <>
              <b>Excluir "{account.name}"?</b>
              <span className="text-muted">Só é possível se não houver lançamentos.</span>
              <div className="flex gap-2">
                <Button size="sm" variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>
                  Excluir
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
                  Cancelar
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" loading={archive.isPending} onClick={() => archive.mutate()}>
                  {account.archived ? "Reativar" : "Arquivar"}
                </Button>
                <Button size="sm" variant="danger" onClick={() => setConfirm(true)}>
                  Excluir
                </Button>
              </div>
              {!account.archived ? (
                <span className="text-muted">Arquivar esconde, mas mantém o histórico.</span>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      <div className="sticky bottom-0 -mx-5 -mb-5 mt-auto flex justify-end gap-2.5 border-t border-line bg-surface px-5 pt-3.5 pb-[calc(14px+env(safe-area-inset-bottom))]">
        <Button variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" loading={save.isPending}>
          {account ? "Salvar" : isCard ? "Criar cartão" : "Criar conta"}
        </Button>
      </div>
    </form>
  );
}
