import { formatBRL, parseBRL } from "@miu/core";
import { ACCOUNT_KIND_LABEL, type Account, BANK_ACCOUNT_KINDS, PALETTE } from "@miu/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeftRight, Banknote, Landmark, LineChart, PiggyBank, Plus } from "lucide-react";
import { useState } from "react";
import { Chip } from "@/components/controls";
import { useQuickAdd } from "@/components/quick-add";
import { Sheet } from "@/components/sheet";
import { toast } from "@/components/toast";
import { Alert, Button, Card, Field, Input } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  accountsQuery,
  archiveAccount,
  createAccount,
  deleteAccount,
  invalidateMoney,
  updateAccount,
} from "@/lib/finance";
import { money } from "@/lib/format";
import { ApiRequestError } from "@/lib/http";

export const Route = createFileRoute("/_app/contas")({
  head: () => ({ meta: [{ title: "Contas · Miu Controle" }] }),
  component: Contas,
});

const KIND_ICON = {
  checking: Landmark,
  savings: PiggyBank,
  cash: Banknote,
  investment: LineChart,
  credit_card: Landmark,
};

function Contas() {
  const { data: accounts = [], isPending } = useQuery(accountsQuery);
  const { openNew } = useQuickAdd();
  const [sheet, setSheet] = useState<{ open: boolean; account: Account | null }>({
    open: false,
    account: null,
  });
  const active = accounts.filter((a) => !a.archived);
  const archived = accounts.filter((a) => a.archived);
  const total = active.reduce((s, a) => s + a.balanceCents, 0);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[13px] font-medium text-muted">Saldo somado das contas</p>
          <p className="num text-[clamp(30px,4.6vw,44px)] font-semibold leading-tight tracking-[-0.035em]">
            {money(total)}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => openNew({ kind: "transfer" })} disabled={active.length < 2}>
            <ArrowLeftRight className="size-4" aria-hidden /> Transferir
          </Button>
          <Button variant="primary" onClick={() => setSheet({ open: true, account: null })}>
            <Plus className="size-4" aria-hidden /> Nova conta
          </Button>
        </div>
      </div>

      {isPending ? <Card className="h-32 animate-pulse" /> : null}
      {!isPending && active.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <h3 className="text-lg font-semibold">Comece pela sua conta principal</h3>
          <p className="max-w-md text-muted">
            Cadastre onde seu dinheiro fica hoje, com o saldo de agora. O Miu calcula o resto.
          </p>
          <Button variant="primary" onClick={() => setSheet({ open: true, account: null })}>
            Cadastrar conta
          </Button>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {active.map((a) => (
          <AccountCard key={a.id} account={a} onEdit={() => setSheet({ open: true, account: a })} />
        ))}
      </div>

      {archived.length ? (
        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-muted">Arquivadas</h3>
          <div className="grid gap-4 opacity-70 sm:grid-cols-2 lg:grid-cols-3">
            {archived.map((a) => (
              <AccountCard key={a.id} account={a} onEdit={() => setSheet({ open: true, account: a })} />
            ))}
          </div>
        </section>
      ) : null}

      <Sheet
        open={sheet.open}
        onClose={() => setSheet((s) => ({ ...s, open: false }))}
        title={sheet.account ? "Editar conta" : "Nova conta"}
      >
        {sheet.open ? (
          <AccountForm account={sheet.account} onDone={() => setSheet((s) => ({ ...s, open: false }))} />
        ) : null}
      </Sheet>
    </>
  );
}

function AccountCard({ account: a, onEdit }: { account: Account; onEdit: () => void }) {
  const Icon = KIND_ICON[a.kind];
  return (
    <Card className="flex flex-col gap-3.5 p-5">
      <div className="flex items-center gap-3">
        <span
          className="grid size-9 place-items-center rounded-[10px] bg-[color-mix(in_srgb,var(--c)_15%,transparent)] text-(--c)"
          style={{ "--c": a.color } as React.CSSProperties}
          aria-hidden
        >
          <Icon className="size-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{a.name}</span>
          <span className="text-[13px] text-muted">{ACCOUNT_KIND_LABEL[a.kind]}</span>
        </span>
        <Button size="sm" variant="ghost" onClick={onEdit}>
          Editar
        </Button>
      </div>
      <p
        className={cn("num text-2xl font-semibold tracking-[-0.025em]", a.balanceCents < 0 && "text-danger")}
      >
        {money(a.balanceCents)}
      </p>
      <Link
        to="/lancamentos"
        search={{ conta: a.id }}
        className="text-sm font-medium text-accent hover:underline"
      >
        Ver lançamentos
      </Link>
    </Card>
  );
}

const centsText = (c: number) => formatBRL(c).replace("R$ ", "").replace("-R$ ", "-");

function AccountForm({ account, onDone }: { account: Account | null; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(account?.name ?? "");
  const [kind, setKind] = useState<(typeof BANK_ACCOUNT_KINDS)[number]>(
    account && account.kind !== "credit_card" ? account.kind : "checking",
  );
  const [color, setColor] = useState(account?.color ?? PALETTE[0]);
  const [balance, setBalance] = useState(account ? centsText(account.initialBalanceCents) : "");
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  const finish = async (message: string) => {
    await invalidateMoney(queryClient);
    toast(message);
    onDone();
  };
  const onError = (e: unknown) =>
    setError(e instanceof ApiRequestError ? e.message : "Não foi possível salvar.");

  const save = useMutation({
    mutationFn: async () => {
      const initialBalanceCents = balance.trim() ? parseBRL(balance) : 0;
      if (initialBalanceCents === null)
        throw new ApiRequestError(400, { erro: "x", mensagem: "Digite o saldo como 1.234,56." });
      return account
        ? updateAccount(account.id, { name: name.trim(), color, initialBalanceCents })
        : createAccount({ name: name.trim(), kind, color, initialBalanceCents });
    },
    onSuccess: () => finish(account ? "Conta atualizada" : "Conta criada"),
    onError,
  });
  const archive = useMutation({
    mutationFn: () => archiveAccount(account?.id ?? "", !account?.archived),
    onSuccess: () => finish(account?.archived ? "Conta reativada" : "Conta arquivada"),
    onError,
  });
  const remove = useMutation({
    mutationFn: () => deleteAccount(account?.id ?? ""),
    onSuccess: () => finish("Conta excluída"),
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
        if (!name.trim()) return setError("Dê um nome para a conta.");
        setError(null);
        save.mutate();
      }}
    >
      {!account ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-muted">Tipo</span>
          <div className="flex flex-wrap gap-2">
            {BANK_ACCOUNT_KINDS.map((k) => (
              <Chip key={k} pressed={kind === k} onClick={() => setKind(k)}>
                {ACCOUNT_KIND_LABEL[k]}
              </Chip>
            ))}
          </div>
          <p className="text-[13px] text-muted">
            Cartões de crédito ganham tela própria, com fatura e parcelas, na próxima etapa.
          </p>
        </div>
      ) : null}
      <Field label="Nome">
        {(p) => (
          <Input
            {...p}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Conta do banco X"
            maxLength={60}
          />
        )}
      </Field>
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
              <b>Excluir a conta "{account.name}"?</b>
              <span className="text-muted">Só é possível se ela não tiver lançamentos.</span>
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
            <div className="flex flex-wrap gap-2">
              <Button size="sm" loading={archive.isPending} onClick={() => archive.mutate()}>
                {account.archived ? "Reativar conta" : "Arquivar conta"}
              </Button>
              <Button size="sm" variant="danger" onClick={() => setConfirm(true)}>
                Excluir
              </Button>
            </div>
          )}
          {!confirm && !account.archived ? (
            <span className="text-muted">
              Arquivar esconde a conta, mas mantém o histórico e o saldo nos relatórios antigos.
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="sticky bottom-0 -mx-5 -mb-5 mt-auto flex justify-end gap-2.5 border-t border-line bg-surface px-5 pt-3.5 pb-[calc(14px+env(safe-area-inset-bottom))]">
        <Button variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" loading={save.isPending}>
          {account ? "Salvar" : "Criar conta"}
        </Button>
      </div>
    </form>
  );
}
