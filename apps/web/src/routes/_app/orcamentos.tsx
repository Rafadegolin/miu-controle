import { formatBRL, parseBRL, todayIn } from "@miu/core";
import type { BudgetLine, Category } from "@miu/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { BudgetBar, BudgetPill } from "@/components/budget";
import { IconTile } from "@/components/category-icon";
import { MonthSwitcher } from "@/components/controls";
import { toast } from "@/components/toast";
import { byId } from "@/components/transaction-row";
import { Alert, Button, Card } from "@/components/ui";
import { budgetsQuery, categoriesQuery, setBudget } from "@/lib/finance";
import { money, monthLabel } from "@/lib/format";
import { ApiRequestError } from "@/lib/http";
import { meQuery } from "@/lib/me";

export const Route = createFileRoute("/_app/orcamentos")({
  validateSearch: (s: Record<string, unknown>): { mes?: string | undefined } => ({
    mes: typeof s.mes === "string" && /^\d{4}-\d{2}$/.test(s.mes) ? s.mes : undefined,
  }),
  head: () => ({ meta: [{ title: "Orçamentos · Miu Controle" }] }),
  component: Orcamentos,
});

function Orcamentos() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { data: me } = useQuery(meQuery);
  const today = todayIn(me?.settings.timezone);
  const month = search.mes ?? today.slice(0, 7);
  const budgets = useQuery(budgetsQuery(month));
  const { data: categories } = useQuery(categoriesQuery);
  const catMap = byId(categories);
  const [editing, setEditing] = useState<string | null>(null);
  const b = budgets.data;
  const totals = b?.totals;
  const remaining = (totals?.limitCents ?? 0) - (totals?.spentCents ?? 0);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthSwitcher month={month} onChange={(mes) => navigate({ search: { mes }, replace: true })} />
      </div>

      {b && b.lines.length > 0 && totals ? (
        <Card className="flex flex-col gap-4 p-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[13px] font-medium text-muted">Gasto em {monthLabel(month)}</p>
              <p className="num text-[clamp(30px,4.6vw,44px)] font-semibold leading-tight tracking-[-0.035em]">
                {money(totals.spentCents)}{" "}
                <span className="text-lg font-medium tracking-normal text-muted">
                  de {money(totals.limitCents)}
                </span>
              </p>
              <p className="mt-1 text-[13px] text-muted">
                {remaining >= 0
                  ? `Ainda dá para gastar ${money(remaining)}`
                  : `Passou ${money(-remaining)} do planejado`}
                {totals.plannedCents ? ` · ${money(totals.plannedCents)} já previsto` : ""}
                {b.dailyAllowanceCents !== null && remaining > 0
                  ? ` · cerca de ${money(b.dailyAllowanceCents)} por dia até o fim do mês`
                  : ""}
              </p>
            </div>
            <BudgetPill status={totals.status} />
          </div>
          <BudgetBar
            spent={totals.spentCents}
            planned={totals.plannedCents}
            limit={totals.limitCents}
            status={totals.status}
          />
        </Card>
      ) : null}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4">
          <h3 className="text-[15px] font-medium text-muted">Por categoria</h3>
          {b?.lines.length ? (
            <span className="text-[13px] text-faint">Toque no valor para mudar o limite</span>
          ) : null}
        </div>
        <div className="mt-3">
          {budgets.isPending ? <div className="h-24 animate-pulse" /> : null}
          {b && b.lines.length === 0 ? (
            <p className="px-5 pb-6 text-muted">
              Nenhum orçamento em {monthLabel(month)}. Escolha abaixo as categorias que você quer controlar: o
              limite sugerido vem da sua média dos últimos 3 meses.
            </p>
          ) : null}
          {b?.lines.map((line) => (
            <BudgetRow
              key={line.categoryId}
              line={line}
              month={month}
              category={catMap.get(line.categoryId)}
              editing={editing === line.categoryId}
              onEdit={(v) => setEditing(v ? line.categoryId : null)}
            />
          ))}
        </div>
      </Card>

      {b && b.suggestions.length > 0 ? (
        <Card className="flex flex-col gap-3 p-5">
          <h3 className="text-[15px] font-medium text-muted">Categorias sem orçamento</h3>
          <div className="flex flex-wrap gap-2">
            {b.suggestions.map((s) => (
              <AddBudgetChip
                key={s.categoryId}
                category={catMap.get(s.categoryId)}
                month={month}
                suggested={s.suggestedCents}
                average={s.averageCents}
                onAdded={() => setEditing(s.categoryId)}
              />
            ))}
          </div>
          <p className="text-[13px] text-muted">O valor do botão é a sugestão; dá para ajustar depois.</p>
        </Card>
      ) : null}
    </>
  );
}

function BudgetRow({
  line,
  month,
  category,
  editing,
  onEdit,
}: {
  line: BudgetLine;
  month: string;
  category?: Category | undefined;
  editing: boolean;
  onEdit: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState(formatBRL(line.limitCents).replace("R$ ", ""));
  const save = useMutation({
    mutationFn: (amount: number | null) => setBudget(line.categoryId, month, amount),
    onSuccess: async (_, amount) => {
      await queryClient.invalidateQueries({ queryKey: ["budgets"] });
      toast(amount === null ? "Orçamento removido" : "Limite atualizado");
      onEdit(false);
    },
  });
  const left = line.limitCents - line.spentCents;

  return (
    <div className="flex items-center gap-3 border-t border-line px-5 py-3 first:border-t-0">
      <IconTile icon={category?.icon} color={category?.color} />
      <div className="min-w-0 flex-1">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <span className="text-[14.5px] font-medium">{category?.name ?? "Categoria"}</span>
            <BudgetPill status={line.status} />
          </span>
          {editing ? (
            <form
              className="flex items-center gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                const cents = parseBRL(value);
                if (cents && cents > 0) save.mutate(cents);
              }}
            >
              <input
                // biome-ignore lint/a11y/noAutofocus: abre direto no campo ao tocar no valor
                autoFocus
                inputMode="decimal"
                aria-label="Novo limite"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="num h-8 w-28 rounded-lg border border-line-strong bg-surface px-2 text-sm"
              />
              <Button type="submit" size="sm" variant="primary" loading={save.isPending}>
                Salvar
              </Button>
              <Button
                size="sm"
                variant="ghost"
                aria-label="Remover orçamento"
                onClick={() => save.mutate(null)}
              >
                <Trash2 className="size-4" />
              </Button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => onEdit(true)}
              className="num text-[13.5px] text-muted hover:underline"
            >
              <b className="text-fg">{money(line.spentCents)}</b> de {money(line.limitCents)}
            </button>
          )}
        </div>
        <BudgetBar
          spent={line.spentCents}
          planned={line.plannedCents}
          limit={line.limitCents}
          status={line.status}
          color={category?.color}
        />
        <p className="mt-1.5 text-[13px] text-muted">
          {left >= 0 ? `Restam ${money(left)}` : `Passou ${money(-left)}`}
          {line.plannedCents ? ` · ${money(line.plannedCents)} previsto` : ""}
          {line.dailyAllowanceCents !== null && left > 0 ? ` · ${money(line.dailyAllowanceCents)}/dia` : ""}
        </p>
        {save.isError ? (
          <div className="mt-2">
            <Alert>
              {save.error instanceof ApiRequestError ? save.error.message : "Não foi possível salvar."}
            </Alert>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function AddBudgetChip({
  category,
  month,
  suggested,
  average,
  onAdded,
}: {
  category?: Category | undefined;
  month: string;
  suggested: number;
  average: number;
  onAdded: () => void;
}) {
  const queryClient = useQueryClient();
  const add = useMutation({
    mutationFn: () => setBudget(category?.id ?? "", month, suggested),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["budgets"] });
      toast(`Orçamento de ${category?.name ?? "categoria"} criado`);
      onAdded();
    },
  });
  if (!category) return null;
  return (
    <button
      type="button"
      disabled={add.isPending}
      onClick={() => add.mutate()}
      title={average ? `Média dos últimos 3 meses: ${money(average)}` : "Sem gastos nos últimos 3 meses"}
      className="inline-flex h-[34px] items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3 text-sm text-fg-2 hover:bg-surface-2"
    >
      <span className="size-2 rounded-full" style={{ background: category.color }} aria-hidden />
      {category.name}
      <span className="num text-faint">{money(suggested)}</span>
      <Plus className="size-4" aria-hidden />
    </button>
  );
}
