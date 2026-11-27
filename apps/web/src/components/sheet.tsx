import { X } from "lucide-react";
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";

/** Tempo máximo da animação de saída (a do CSS é ~220ms); depois disso fecha de qualquer jeito. */
const CLOSE_FALLBACK_MS = 320;

/**
 * Painel lateral (desktop) / folha de baixo (celular) usando <dialog> nativo:
 * foco preso dentro, Esc fecha e o resto da página fica inerte, sem biblioteca.
 *
 * Entra deslizando e sai deslizando: ao pedir para fechar, marca `data-closing`, espera a animação
 * (classe .sheet em styles.css) e só então fecha o dialog. O conteúdo fica montado durante a saída
 * e é desmontado depois — quem usa não precisa condicionar os filhos a `open`.
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
  const [mounted, setMounted] = useState(open);

  // Layout effect: abre ainda dentro do toque que pediu, senão o iOS não mostra o teclado.
  useLayoutEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open) {
      setMounted(true);
      d.removeAttribute("data-closing");
      if (!d.open) {
        d.showModal();
        // O dialog põe o foco no primeiro botão (o X). Vai para o campo inicial ou para o próprio painel.
        const first = d.querySelector<HTMLElement>("[data-autofocus]");
        (first ?? d).focus({ preventScroll: true });
      }
      return;
    }
    if (!d.open) return;
    const finish = () => {
      d.removeAttribute("data-closing");
      if (d.open) d.close();
      setMounted(false);
    };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      finish();
      return;
    }
    d.setAttribute("data-closing", "");
    const onEnd = (e: AnimationEvent) => {
      if (e.target === d) finish();
    };
    d.addEventListener("animationend", onEnd);
    const timer = window.setTimeout(finish, CLOSE_FALLBACK_MS);
    return () => {
      d.removeEventListener("animationend", onEnd);
      window.clearTimeout(timer);
    };
  }, [open]);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: o teclado fecha pelo Esc (onCancel); o clique é só no fundo
    <dialog
      ref={ref}
      onClose={() => {
        if (open) onClose();
      }}
      // Esc: o navegador fecharia na hora; em vez disso, pede para fechar (com animação).
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-label={title}
      tabIndex={-1}
      className="sheet m-0 mt-auto max-h-[92dvh] w-full max-w-none rounded-t-[20px] border border-line bg-surface p-0 text-fg backdrop:bg-black/50 sm:mt-0 sm:ml-auto sm:h-dvh sm:max-h-dvh sm:max-w-[460px] sm:rounded-none sm:border-y-0 sm:border-r-0"
    >
      {/* No celular a altura vem do conteúdo (até 92dvh); só no desktop o painel tem altura fixa. */}
      {open || mounted ? (
        <div className="flex max-h-[inherit] flex-col sm:h-full">
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
          {/* flex-auto + min-h-0: base = conteúdo. Com flex-1 (base 0%) o Safari zerava a altura. */}
          <div className="flex min-h-0 flex-auto flex-col gap-[18px] overflow-auto p-5">{children}</div>
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
