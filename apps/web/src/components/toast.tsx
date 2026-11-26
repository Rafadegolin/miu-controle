import { Check } from "lucide-react";
import { useSyncExternalStore } from "react";

type ToastAction = { label: string; onClick: () => void };
type Toast = { id: number; message: string; action?: ToastAction | undefined };
let toasts: Toast[] = [];
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => {
  for (const l of listeners) l();
};
const dismiss = (id: number) => {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
};

/** Aviso curto ("Lançamento salvo"). Com `action`, mostra um botão (ex.: Desfazer) e fica mais tempo. */
export function toast(message: string, action?: ToastAction) {
  const id = ++seq;
  toasts = [...toasts, { id, message, action }];
  emit();
  setTimeout(() => dismiss(id), action ? 6000 : 2600);
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
          className="flex items-center gap-2 rounded-xl bg-fg py-2.5 pr-2.5 pl-4 text-sm font-medium text-bg shadow-lg"
        >
          <Check className="size-4 shrink-0" aria-hidden />
          <span className="pr-1.5">{t.message}</span>
          {t.action ? (
            <button
              type="button"
              onClick={() => {
                dismiss(t.id);
                t.action?.onClick();
              }}
              className="pointer-events-auto rounded-lg px-2.5 py-1 font-semibold text-accent-fill hover:bg-[color-mix(in_srgb,var(--bg)_14%,transparent)]"
            >
              {t.action.label}
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
