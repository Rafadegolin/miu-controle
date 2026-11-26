import { X } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";

/**
 * Painel lateral (desktop) / folha de baixo (celular) usando <dialog> nativo:
 * foco preso dentro, Esc fecha e o resto da página fica inerte, sem biblioteca.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      aria-label={title}
      className="m-0 mt-auto max-h-[92dvh] w-full max-w-none rounded-t-[20px] border border-line bg-surface p-0 text-fg backdrop:bg-black/50 sm:mt-0 sm:ml-auto sm:h-dvh sm:max-h-dvh sm:max-w-[460px] sm:rounded-none sm:border-y-0 sm:border-r-0"
    >
      {open ? (
        <div className="flex h-full max-h-[inherit] flex-col">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <h2 className="text-[17px] font-semibold">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="grid size-9 place-items-center rounded-control text-muted hover:bg-surface-2 hover:text-fg"
              aria-label="Fechar"
            >
              <X className="size-[18px]" />
            </button>
          </div>
          <div className="flex flex-1 flex-col gap-[18px] overflow-auto p-5">{children}</div>
          {footer ? (
            <div className="flex flex-wrap justify-end gap-2.5 border-t border-line px-5 pt-3.5 pb-[calc(14px+env(safe-area-inset-bottom))]">
              {footer}
            </div>
          ) : null}
        </div>
      ) : null}
    </dialog>
  );
}
