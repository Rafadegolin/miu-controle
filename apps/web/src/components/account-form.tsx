import { formatBRL, parseBRL } from "@miu/core";
import {
  ACCOUNT_KIND_LABEL,
  ACCOUNT_KINDS,
  type Account,
  type AccountKind,
  CARD_BRANDS,
  type CardBrand,
  INSTITUTIONS,
  type InstitutionSlug,
  institutionBySlug,
  PALETTE,
} from "@miu/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { cn } from "@/lib/cn";
import {
  accountsQuery,
  archiveAccount,
  createAccount,
  deleteAccount,
  invalidateMoney,
  updateAccount,
} from "@/lib/finance";
import { ApiRequestError } from "@/lib/http";
import { Chip } from "./controls";
import { CardBrandMark } from "./institution-logo";
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
      <AccountForm account={account} defaultKind={defaultKind ?? "checking"} onDone={onClose} />
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
  const [institution, setInstitution] = useState<InstitutionSlug | null>(
    (institutionBySlug(account?.institution)?.slug as InstitutionSlug | undefined) ?? null,
  );
  const [cardBrand, setCardBrand] = useState<CardBrand | null>(account?.cardBrand ?? null);
  // Conta que paga a fatura: as contas ativas (não cartões). Padrão = a do mesmo banco, ou a única.
  const { data: allAccounts = [] } = useQuery(accountsQuery);
  const payers = allAccounts.filter((a) => !a.card && !a.archived && a.id !== account?.id);
  const [payFrom, setPayFrom] = useState<string>(() => {
    if (account) return account.payFromAccountId ?? "";
    return payers.length === 1 ? (payers[0]?.id ?? "") : "";
  });
  const suggestedPayer = (inst: string | null) =>
    (inst ? payers.find((a) => a.institution === inst)?.id : undefined) ??
    (payers.length === 1 ? payers[0]?.id : undefined) ??
    "";
  const brandColor = institutionBySlug(institution)?.color;
  const pickInstitution = (slug: InstitutionSlug | null) => {
    setInstitution(slug);
    const inst = institutionBySlug(slug);
    if (!inst) return;
    setColor(inst.color);
    if (!name.trim()) setName(inst.name);
    if (isCard && !payFrom) setPayFrom(suggestedPayer(inst.slug));
  };
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
              institution,
              cardBrand,
              payFromAccountId: payFrom || null,
              creditLimitCents,
              closingDay: c,
              dueDay: d,
            })
          : createAccount({
              name: name.trim(),
              kind: "credit_card",
              color,
              institution,
              cardBrand,
              payFromAccountId: payFrom || null,
              creditLimitCents,
              closingDay: c,
              dueDay: d,
            });
      }
      const initialBalanceCents = balance.trim() ? parseBRL(balance) : 0;
      if (initialBalanceCents === null) throw fail("Digite o saldo como 1.234,56.");
      return account
        ? updateAccount(account.id, { name: name.trim(), color, institution, initialBalanceCents })
        : createAccount({
            name: name.trim(),
            kind: kind as Exclude<AccountKind, "credit_card">,
            color,
            institution,
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
      <BankPicker value={institution} onChange={pickInstitution} />

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
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-muted">Bandeira</span>
            <div className="flex flex-wrap gap-2">
              {CARD_BRANDS.map((b) => (
                <button
                  key={b.slug}
                  type="button"
                  aria-pressed={cardBrand === b.slug}
                  aria-label={b.name}
                  onClick={() => setCardBrand(cardBrand === b.slug ? null : b.slug)}
                  className={cn(
                    "rounded-[10px] p-1 ring-2 transition",
                    cardBrand === b.slug ? "ring-primary" : "ring-transparent hover:ring-line-strong",
                  )}
                >
                  <CardBrandMark brand={b.slug} className="h-8 min-w-14" />
                </button>
              ))}
            </div>
          </div>
          <Field
            label="Fatura paga pela conta"
            hint="O valor da fatura sai desta conta na projeção do saldo, no mês do vencimento."
          >
            {(p) => (
              <select
                {...p}
                value={payFrom}
                onChange={(e) => setPayFrom(e.target.value)}
                className="h-11 w-full rounded-control border border-line-strong bg-surface px-3"
              >
                <option value="">Nenhuma (só entra no total)</option>
                {payers.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
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
          {[
            ...(brandColor && !(PALETTE as readonly string[]).includes(brandColor) ? [brandColor] : []),
            ...PALETTE,
          ].map((c) => (
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
        <div className="flex flex-col gap-2 rounded-[14px] bg-surface-2 p-3.5 text-sm">
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

      <div className="sticky -bottom-5 -mx-5 -mb-5 mt-auto flex justify-end gap-2.5 border-t border-line bg-surface px-5 pt-3.5 pb-[calc(14px+env(safe-area-inset-bottom))]">
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

/** Escolha do banco: busca + grade de logos. "Nenhum" volta para o ícone tingido. */
function BankPicker({
  value,
  onChange,
}: {
  value: InstitutionSlug | null;
  onChange: (slug: InstitutionSlug | null) => void;
}) {
  const [q, setQ] = useState("");
  const norm = (t: string) =>
    t
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase();
  const list = INSTITUTIONS.filter((i) => norm(i.name).includes(norm(q.trim())));
  const selected = institutionBySlug(value);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-muted">Banco</span>
        {selected ? (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-[13px] text-muted hover:underline"
          >
            Nenhum
          </button>
        ) : null}
      </div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar banco…"
        aria-label="Buscar banco"
        className="h-10 rounded-control border border-line-strong bg-surface px-3 outline-none focus:border-primary"
      />
      <div className="grid max-h-[188px] grid-cols-5 gap-2 overflow-auto p-0.5 sm:grid-cols-6">
        {list.map((i) => (
          <button
            key={i.slug}
            type="button"
            onClick={() => onChange(i.slug)}
            aria-pressed={value === i.slug}
            title={i.name}
            className={cn(
              "flex flex-col items-center gap-1 rounded-[12px] p-1.5 ring-2 transition",
              value === i.slug ? "bg-accent-soft ring-primary" : "ring-transparent hover:bg-surface-2",
            )}
          >
            <img
              src={`/bancos/${i.slug}.svg`}
              alt=""
              loading="lazy"
              className="size-10 rounded-[10px] bg-white object-cover ring-1 ring-line"
            />
            <span className="w-full truncate text-center text-[11px] text-fg-2">{i.name}</span>
          </button>
        ))}
        {list.length === 0 ? (
          <p className="col-span-full py-3 text-center text-sm text-muted">
            Não achou? Deixe sem banco e escolha uma cor.
          </p>
        ) : null}
      </div>
    </div>
  );
}
