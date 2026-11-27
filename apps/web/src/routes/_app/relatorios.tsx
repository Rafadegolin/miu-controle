import { todayIn } from "@miu/core";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AnimatedNumber } from "@/components/animated-number";
import { CashflowChart } from "@/components/cashflow-chart";
import { IconTile } from "@/components/category-icon";
import { MonthSwitcher, Segmented } from "@/components/controls";
import { CardsSkeleton } from "@/components/skeletons";
import { byId } from "@/components/transaction-row";
import { Card } from "@/components/ui";
import { cn } from "@/lib/cn";
import { cashflowQuery, categoriesQuery, categoryReportQuery } from "@/lib/finance";
import { MONTHS, money, monthShort } from "@/lib/format";
import { awaitData, todayFor } from "@/lib/loaders";
import { meQuery } from "@/lib/me";

type Search = { mes?: string | undefined; periodo?: 6 | 12 | undefined };

export const Route = createFileRoute("/_app/relatorios")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    mes: typeof s.mes === "string" && /^\d{4}-\d{2}$/.test(s.mes) ? s.mes : undefined,
    periodo: s.periodo === 6 || s.periodo === "6" ? 6 : undefined,
  }),
  loaderDeps: ({ search }) => ({ mes: search.mes, periodo: search.periodo }),
  loader: ({ context, deps }) => {
    const qc = context.queryClient;
    const month = deps.mes ?? todayFor(qc).slice(0, 7);
    return awaitData([
      qc.ensureQueryData(cashflowQuery(month, deps.periodo ?? 12)),
      qc.ensureQueryData(categoryReportQuery(month)),
      qc.ensureQueryData(categoriesQuery),
    ]);
  },
  head: () => ({ meta: [{ title: "Relatórios · Miu Controle" }] }),
  component: Relatorios,
  pendingComponent: CardsSkeleton,
});

function Relatorios() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { data: me } = useQuery(meQuery);
  const today = todayIn(me?.settings.timezone);
  const month = search.mes ?? today.slice(0, 7);
  const months = search.periodo ?? 12;
  const flow = useQuery(cashflowQuery(month, months));
  const cats = useQuery(categoryReportQuery(month));
  const { data: categories } = useQuery(categoriesQuery);
  const catMap = byId(categories);
  const data = flow.data ?? [];

  const totalIn = data.reduce((s, d) => s + d.incomeCents, 0);
  const totalOut = data.reduce((s, d) => s + d.expenseCents, 0);
  const withIncome = data.filter((d) => d.incomeCents > 0);
  const avgSaving = withIncome.length
    ? withIncome.reduce((s, d) => s + (d.incomeCents - d.expenseCents) / d.incomeCents, 0) / withIncome.length
    : null;
  const monthName = MONTHS[Number(month.slice(5, 7)) - 1];

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthSwitcher
          month={month}
          onChange={(mes) => navigate({ search: (p) => ({ ...p, mes }), replace: true })}
        />
        <Segmented
          label="Período"
          value={String(months) as "6" | "12"}
          onChange={(v) =>
            navigate({ search: (p) => ({ ...p, periodo: v === "6" ? 6 : undefined }), replace: true })
          }
          options={[
            { value: "6", label: "6 meses" },
            { value: "12", label: "12 meses" },
          ]}
        />
      </div>

      <div className="rise grid gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-[13px] font-medium text-muted">Entrou em {months} meses</p>
          <p className="num-display mt-1 text-[28px] text-accent">
            <AnimatedNumber value={totalIn} />
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-[13px] font-medium text-muted">Saiu em {months} meses</p>
          <p className="num-display mt-1 text-[28px]">
            <AnimatedNumber value={totalOut} />
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-[13px] font-medium text-muted">Guardou, em média</p>
          <p
            className={cn(
              "num-display mt-1 text-[28px]",
              avgSaving !== null && avgSaving < 0 && "text-danger",
            )}
          >
            {avgSaving === null ? "—" : `${Math.round(avgSaving * 100)}%`}
          </p>
          <p className="mt-1 text-[13px] text-muted">do que entrou, por mês</p>
        </Card>
      </div>

      <Card className="flex flex-col gap-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-[15px] font-medium text-muted">Receitas x despesas</h3>
          <div className="flex flex-wrap gap-4 text-[13px] text-muted">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-accent-fill" /> Receitas
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-fg-2" /> Despesas
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm border border-dashed border-line-strong" /> Hachurado =
              previsto
            </span>
          </div>
        </div>
        <div className="overflow-x-auto">
          {flow.isPending ? (
            <div className="h-60 skeleton" />
          ) : (
            <CashflowChart data={data} highlight={month} />
          )}
        </div>
      </Card>

      <div className="rise grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="px-5 pt-4">
            <h3 className="text-[15px] font-medium text-muted">Mês a mês</h3>
          </div>
          <div className="mt-2 overflow-x-auto">
            <table className="num w-full text-sm">
              <thead>
                <tr className="text-left text-[12.5px] text-muted">
                  <th className="px-5 py-2.5 font-medium">Mês</th>
                  <th className="px-3 py-2.5 text-right font-medium">Receitas</th>
                  <th className="px-3 py-2.5 text-right font-medium">Despesas</th>
                  <th className="px-3 py-2.5 text-right font-medium">Resultado</th>
                  <th className="px-5 py-2.5 text-right font-medium">Guardou</th>
                </tr>
              </thead>
              <tbody>
                {[...data].reverse().map((d) => {
                  const result = d.incomeCents - d.expenseCents;
                  return (
                    <tr key={d.month} className="border-t border-line">
                      <td className="px-5 py-2.5">{monthShort(d.month)}</td>
                      <td className="px-3 py-2.5 text-right text-accent">{money(d.incomeCents)}</td>
                      <td className="px-3 py-2.5 text-right">{money(d.expenseCents)}</td>
                      <td className={cn("px-3 py-2.5 text-right", result < 0 && "text-danger")}>
                        {money(result)}
                      </td>
                      <td className="px-5 py-2.5 text-right text-muted">
                        {d.incomeCents ? `${Math.round((result / d.incomeCents) * 100)}%` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between px-5 pt-4">
            <h3 className="text-[15px] font-medium text-muted">Gastos em {monthName}</h3>
            <span className="text-xs text-faint">vs. média dos 3 meses antes</span>
          </div>
          <div className="mt-2">
            {cats.data?.rows.length === 0 ? (
              <p className="px-5 py-8 text-center text-muted">Nenhuma despesa neste período.</p>
            ) : null}
            {cats.data?.rows.map((r) => {
              const cat = r.categoryId ? catMap.get(r.categoryId) : undefined;
              const diff = r.averageCents ? Math.round((r.totalCents / r.averageCents - 1) * 100) : null;
              const share = cats.data.totalExpenseCents
                ? Math.round((r.totalCents / cats.data.totalExpenseCents) * 100)
                : 0;
              return (
                <div
                  key={r.categoryId ?? "none"}
                  className="flex items-center gap-3 border-t border-line px-5 py-3 first:border-t-0"
                >
                  <IconTile icon={cat?.icon} color={cat?.color} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-medium">
                      {cat?.name ?? "Sem categoria"}
                    </span>
                    <span className="text-[13px] text-muted">
                      {share}% das despesas · média {money(r.averageCents)}
                    </span>
                  </span>
                  {diff !== null ? (
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium",
                        diff > 15
                          ? "bg-warn-soft text-warn"
                          : diff < -15
                            ? "bg-accent-soft text-accent"
                            : "bg-surface-2 text-muted",
                      )}
                    >
                      {diff > 0 ? "+" : ""}
                      {diff}%
                    </span>
                  ) : (
                    <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">novo</span>
                  )}
                  <span className="num min-w-[96px] text-right text-[15px] font-semibold">
                    {money(r.totalCents)}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </>
  );
}
