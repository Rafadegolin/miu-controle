import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { budgetsQuery, categoriesQuery } from "@/lib/finance";
import { money } from "@/lib/format";
import { BudgetBar, BudgetPill } from "./budget";
import { byId } from "./transaction-row";
import { Card } from "./ui";

/** Os orçamentos mais apertados do mês (até 4). */
export function BudgetsCard({ month }: { month: string }) {
  const { data } = useQuery(budgetsQuery(month));
  const { data: categories } = useQuery(categoriesQuery);
  const catMap = byId(categories);
  if (!data || data.lines.length === 0) return null;
  return (
    <Card>
      <div className="flex items-center justify-between px-5 pt-4">
        <h3 className="text-[15px] font-medium text-muted">Orçamentos</h3>
        <Link to="/orcamentos" className="text-sm font-medium text-accent hover:underline">
          Ver todos
        </Link>
      </div>
      <div className="flex flex-col gap-4 px-5 pt-4 pb-5">
        {data.lines.slice(0, 4).map((l) => {
          const cat = catMap.get(l.categoryId);
          return (
            <div key={l.categoryId}>
              <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2 font-medium">
                  {cat?.name ?? "Categoria"} <BudgetPill status={l.status} />
                </span>
                <span className="num text-muted">
                  <b className="text-fg">{money(l.spentCents)}</b> de {money(l.limitCents)}
                </span>
              </div>
              <BudgetBar
                spent={l.spentCents}
                planned={l.plannedCents}
                limit={l.limitCents}
                status={l.status}
                color={cat?.color}
              />
            </div>
          );
        })}
      </div>
    </Card>
  );
}
