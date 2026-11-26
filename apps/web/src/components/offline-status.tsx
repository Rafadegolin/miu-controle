import { CloudOff, RefreshCw } from "lucide-react";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";
import { offlineStore } from "@/lib/offline";

/** Pílula discreta: sem internet e/ou lançamentos guardados no aparelho esperando envio. */
export function OfflineStatus({ className }: { className?: string }) {
  const { pending, online } = useSyncExternalStore(
    offlineStore.subscribe,
    offlineStore.get,
    offlineStore.get,
  );
  if (online && pending === 0) return null;
  const label =
    pending === 0
      ? "Sem internet"
      : `${pending} ${pending === 1 ? "lançamento" : "lançamentos"} ${online ? "enviando" : "aguardando internet"}`;
  const Icon = online ? RefreshCw : CloudOff;
  return (
    <span
      role="status"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-warn-soft px-2.5 py-1 text-xs font-medium text-warn",
        className,
      )}
    >
      <Icon className={cn("size-3.5", online && "animate-spin")} aria-hidden />
      {label}
    </span>
  );
}
