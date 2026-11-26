import { Check } from "lucide-react";
import { useSyncExternalStore } from "react";

type Toast = { id: number; message: string };
let toasts: Toast[] = [];
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => {
  for (const l of listeners) l();
};

/** Aviso curto de confirmação ("Lançamento salvo"). */
export function toast(message: string) {
  const id = ++seq;
  toasts = [...toasts, { id, message }];
  emit();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    emit();
  }, 2600);
}

export function Toaster() {
  const list = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => toasts,
  );
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-[calc(84px+env(safe-area-inset-bottom))] left-1/2 z-60 flex -translate-x-1/2 flex-col items-center gap-2 lg:bottom-6"
    >
      {list.map((t) => (
        <div
          key={t.id}
          className="flex items-center gap-2 rounded-xl bg-fg px-4 py-2.5 text-sm font-medium text-bg shadow-lg"
        >
          <Check className="size-4" aria-hidden />
          {t.message}
        </div>
      ))}
    </div>
  );
}
