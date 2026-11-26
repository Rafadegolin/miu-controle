import type { Account, Category, Transaction } from "@miu/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { confirmTransaction, invalidateMoney } from "@/lib/finance";
import { dayShort, signedMoney } from "@/lib/format";
import { IconTile } from "./category-icon";
import { useQuickAdd } from "./quick-add";
import { toast } from "./toast";

export function TransactionRow({
  tx,
  accounts,
  categories,
  showDate,
}: {
  tx: Transaction;
  accounts: Map<string, Account>;
  categories: Map<string, Category>;
  showDate?: boolean;
}) {
  const { openEdit } = useQuickAdd();
  const queryClient = useQueryClient();
  const confirm = useMutation({
    mutationFn: () => confirmTransaction(tx.id),
    onSuccess: async () => {
      await invalidateMoney(queryClient);
      toast(`Confirmado: ${tx.description}`);
    },
  });

  const cat = tx.categoryId ? categories.get(tx.categoryId) : undefined;
  const from = accounts.get(tx.accountId)?.name ?? "Conta";
  const meta =
    tx.kind === "transfer"
      ? `${from} → ${tx.toAccountId ? (accounts.get(tx.toAccountId)?.name ?? "Conta") : ""}`
      : `${cat?.name ?? "Sem categoria"} · ${from}`;
  const planned = tx.status === "planned";

  return (
    <div className="flex items-center border-t border-line first:border-t-0 hover:bg-surface-2">
      <button
        type="button"
        onClick={() => openEdit(tx)}
        className="flex min-w-0 flex-1 items-center gap-3 px-5 py-3 text-left"
      >
        <IconTile icon={cat?.icon} color={cat?.color} transfer={tx.kind === "transfer"} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className={cn("truncate text-[14.5px] font-medium", planned && "text-fg-2")}>
              {tx.description}
            </span>
            {tx.installment ? (
              <span className="rounded-full bg-surface-2 px-2 text-xs text-muted">
                {tx.installment.no}/{tx.installment.total}
              </span>
            ) : null}
            {planned ? (
              <span className="rounded-full border border-dashed border-line-strong px-2 text-xs text-muted">
                Previsto
              </span>
            ) : null}
          </span>
          <span className="block truncate text-[13px] text-muted">
            {showDate ? `${dayShort(tx.date)} · ` : ""}
            {meta}
          </span>
        </span>
        <span
          className={cn(
            "num text-right text-[15px] font-semibold whitespace-nowrap",
            tx.kind === "income" ? "text-accent" : tx.kind === "transfer" ? "text-muted" : "text-fg",
          )}
        >
          {signedMoney(tx.amountCents, tx.kind)}
        </span>
      </button>
      {planned ? (
        <button
          type="button"
          onClick={() => confirm.mutate()}
          disabled={confirm.isPending}
          className="mr-4 grid h-8 shrink-0 place-items-center rounded-lg border border-line-strong bg-surface px-2.5 text-[13px] font-medium hover:bg-surface-2"
          aria-label={`Confirmar ${tx.description}`}
          title="Confirmar: aconteceu"
        >
          <Check className="size-4" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

export const byId = <T extends { id: string }>(list: T[] | undefined) =>
  new Map((list ?? []).map((x) => [x.id, x]));
