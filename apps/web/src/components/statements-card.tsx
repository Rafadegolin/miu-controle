import type { Account } from "@miu/shared";
import { useQueries } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CreditCard } from "lucide-react";
import { cardOverviewQuery } from "@/lib/finance";
import { dayShort, money } from "@/lib/format";
import { StatusPill } from "./status-pill";
import { Card } from "./ui";

/** Uma linha por cartão com a fatura que pede atenção agora. */
export function StatementsCard({ cards }: { cards: Account[] }) {
  const overviews = useQueries({ queries: cards.map((c) => cardOverviewQuery(c.id)) });
  const rows = cards.map((card, i) => {
    const o = overviews[i]?.data;
    const s = o?.pending.find((p) => p.month === o.focusMonth);
    return { card, s };
  });
  const total = rows.reduce((sum, r) => sum + (r.s?.remainingCents ?? 0), 0);

  return (
    <Card className="flex flex-col gap-3.5 p-5">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-medium text-muted">Faturas a pagar</p>
        <Link to="/cartoes" className="text-sm font-medium text-accent hover:underline">
          Ver cartões
        </Link>
      </div>
      <p className="num text-2xl font-semibold tracking-[-0.025em]">{money(total)}</p>
      {rows.map(({ card, s }) => (
        <Link
          key={card.id}
          to="/cartoes"
          search={{ id: card.id, fatura: s?.month }}
          className="flex items-center gap-3 rounded-lg hover:bg-surface-2"
        >
          <span
            className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-[color-mix(in_srgb,var(--c)_15%,transparent)] text-(--c)"
            style={{ "--c": card.color } as React.CSSProperties}
            aria-hidden
          >
            <CreditCard className="size-[18px]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{card.name}</span>
            <span className="text-[13px] text-muted">{s ? `Vence ${dayShort(s.dueDate)}` : "…"}</span>
          </span>
          {s ? <StatusPill status={s.status} /> : null}
          <b className="num min-w-[88px] text-right">{money(s?.remainingCents ?? 0)}</b>
        </Link>
      ))}
    </Card>
  );
}
