import { ACCOUNT_KIND_LABEL, type Account, type AccountKind } from "@miu/shared";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeftRight, Plus } from "lucide-react";
import { useState } from "react";
import { AccountSheet } from "@/components/account-form";
import { AnimatedNumber } from "@/components/animated-number";
import { CardBrandMark, InstitutionLogo } from "@/components/institution-logo";
import { useQuickAdd } from "@/components/quick-add";
import { CardsSkeleton } from "@/components/skeletons";
import { Button, Card } from "@/components/ui";
import { cn } from "@/lib/cn";
import { accountsQuery } from "@/lib/finance";
import { money } from "@/lib/format";
import { awaitData } from "@/lib/loaders";

export const Route = createFileRoute("/_app/contas")({
  loader: ({ context }) => awaitData([context.queryClient.ensureQueryData(accountsQuery)]),
  head: () => ({ meta: [{ title: "Contas · Miu Controle" }] }),
  component: Contas,
  pendingComponent: CardsSkeleton,
});

function Contas() {
  const { data: accounts = [], isPending } = useQuery(accountsQuery);
  const { openNew } = useQuickAdd();
  const [sheet, setSheet] = useState<{ open: boolean; account: Account | null; kind?: AccountKind }>({
    open: false,
    account: null,
  });
  const banks = accounts.filter((a) => !a.archived && !a.card);
  const cards = accounts.filter((a) => !a.archived && a.card);
  const archived = accounts.filter((a) => a.archived);
  const total = banks.reduce((s, a) => s + a.balanceCents, 0);
  const debt = cards.reduce((s, a) => s + a.balanceCents, 0);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap gap-8">
          <div>
            <p className="text-[13px] font-medium text-muted">Saldo das contas</p>
            <p className="num text-[clamp(30px,4.6vw,44px)] font-semibold leading-tight tracking-[-0.035em]">
              {money(total)}
            </p>
          </div>
          {cards.length ? (
            <div>
              <p className="text-[13px] font-medium text-muted">Patrimônio (contas − cartões)</p>
              <p className="num text-[clamp(22px,3vw,28px)] font-semibold leading-tight tracking-[-0.03em] text-fg-2">
                {money(total + debt)}
              </p>
              <p className="text-[13px] text-muted">inclui parcelas futuras já compradas</p>
            </div>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => openNew({ kind: "transfer" })}
            disabled={banks.length < 1 || accounts.length < 2}
          >
            <ArrowLeftRight className="size-4" aria-hidden /> Transferir
          </Button>
          <Button variant="primary" onClick={() => setSheet({ open: true, account: null })}>
            <Plus className="size-4" aria-hidden /> Nova conta
          </Button>
        </div>
      </div>

      {isPending ? <Card className="h-32 skeleton" /> : null}
      {!isPending && banks.length === 0 ? (
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

      {banks.length ? (
        <div className="rise grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {banks.map((a) => (
            <AccountCard key={a.id} account={a} onEdit={() => setSheet({ open: true, account: a })} />
          ))}
        </div>
      ) : null}

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">Cartões de crédito</h3>
          <Button size="sm" onClick={() => setSheet({ open: true, account: null, kind: "credit_card" })}>
            <Plus className="size-4" aria-hidden /> Novo cartão
          </Button>
        </div>
        {cards.length === 0 ? (
          <Card className="px-5 py-6 text-sm text-muted">
            Cadastre seus cartões com o dia de fechamento e de vencimento. Cada compra cai na fatura certa e
            as parcelas aparecem mês a mês.
          </Card>
        ) : (
          <div className="rise grid gap-4 sm:grid-cols-2">
            {cards.map((a) => (
              <CardSummary key={a.id} account={a} onEdit={() => setSheet({ open: true, account: a })} />
            ))}
          </div>
        )}
      </section>

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

      <AccountSheet
        open={sheet.open}
        account={sheet.account}
        defaultKind={sheet.kind}
        onClose={() => setSheet((s) => ({ ...s, open: false }))}
      />
    </>
  );
}

function AccountCard({ account: a, onEdit }: { account: Account; onEdit: () => void }) {
  return (
    <Card className="flex flex-col gap-3.5 p-5">
      <div className="flex items-center gap-3">
        <InstitutionLogo account={a} />
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
        <AnimatedNumber value={a.balanceCents} />
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

function CardSummary({ account: a, onEdit }: { account: Account; onEdit: () => void }) {
  const limit = a.card?.creditLimitCents ?? 0;
  const used = Math.max(0, -a.balanceCents);
  const pct = limit ? Math.min(100, (used / limit) * 100) : 0;
  return (
    <Card className="flex flex-col gap-3.5 p-5">
      <div className="flex items-center gap-3">
        <InstitutionLogo account={a} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{a.name}</span>
          <span className="text-[13px] text-muted">
            Fecha dia {a.card?.closingDay} · vence dia {a.card?.dueDay}
          </span>
        </span>
        <CardBrandMark brand={a.cardBrand} />
        <Button size="sm" variant="ghost" onClick={onEdit}>
          Editar
        </Button>
      </div>
      <div>
        <div className="mb-1.5 flex justify-between text-[13.5px] text-muted">
          <span>
            Usado <b className="num text-fg">{money(used)}</b>
          </span>
          <span>
            Disponível{" "}
            <b className={cn("num", limit - used < 0 ? "text-danger" : "text-fg")}>{money(limit - used)}</b>
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-surface-2">
          <div className="bar-fill h-full rounded-full" style={{ width: `${pct}%`, background: a.color }} />
        </div>
      </div>
      <Link to="/cartoes" search={{ id: a.id }} className="text-sm font-medium text-accent hover:underline">
        Ver faturas
      </Link>
    </Card>
  );
}
