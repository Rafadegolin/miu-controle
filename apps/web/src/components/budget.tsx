import { BUDGET_STATUS_LABEL, type BudgetStatus } from "@miu/shared";
import { cn } from "@/lib/cn";

const TONE: Record<BudgetStatus, string> = {
  ok: "bg-accent-soft text-accent",
  warning: "bg-warn-soft text-warn",
  over: "bg-danger-soft text-danger",
};
const BAR: Record<BudgetStatus, string> = { ok: "", warning: "var(--warn)", over: "var(--danger)" };

export function BudgetPill({ status }: { status: BudgetStatus }) {
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", TONE[status])}>
      {BUDGET_STATUS_LABEL[status]}
    </span>
  );
}

/** Barra com o realizado sólido e o previsto hachurado. */
export function BudgetBar({
  spent,
  planned,
  limit,
  status,
  color,
}: {
  spent: number;
  planned: number;
  limit: number;
  status: BudgetStatus;
  color?: string | undefined;
}) {
  const w = (v: number) => `${Math.max(0, Math.min(100, (v / Math.max(1, limit)) * 100))}%`;
  const fill = BAR[status] || color || "var(--accent-fill)";
  return (
    <div className="flex h-2 overflow-hidden rounded-full bg-surface-2">
      <span className="bar-fill h-full" style={{ width: w(spent), background: fill }} />
      <span
        className="h-full"
        style={{
          width: w(Math.min(planned, Math.max(0, limit - spent))),
          background: `repeating-linear-gradient(45deg, color-mix(in srgb, ${fill} 55%, transparent) 0 3px, transparent 3px 6px)`,
        }}
      />
    </div>
  );
}
