import { STATEMENT_STATUS_LABEL, type StatementStatus } from "@miu/shared";
import { cn } from "@/lib/cn";

const STATUS_TONE: Record<StatementStatus, string> = {
  open: "bg-surface-2 text-muted",
  closed: "bg-warn-soft text-warn",
  paid: "bg-accent-soft text-accent",
  overdue: "bg-danger-soft text-danger",
};

/** Situação da fatura: aberta, fechada, paga ou vencida. */
export function StatusPill({ status }: { status: StatementStatus }) {
  return (
    <span
      className={cn("rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", STATUS_TONE[status])}
    >
      {STATEMENT_STATUS_LABEL[status]}
    </span>
  );
}
