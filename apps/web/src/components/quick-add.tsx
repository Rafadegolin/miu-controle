import type { Transaction } from "@miu/shared";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { type Draft, TransactionSheet } from "./transaction-sheet";

type QuickAdd = {
  openNew: (defaults?: Partial<Draft>) => void;
  openEdit: (tx: Transaction) => void;
};

const Ctx = createContext<QuickAdd | null>(null);

export function useQuickAdd() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useQuickAdd fora do QuickAddProvider");
  return ctx;
}

/** Lançamento rápido disponível em todo o app: botão "+", atalho N e edição de qualquer lista. */
export function QuickAddProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{
    open: boolean;
    editing: Transaction | null;
    defaults?: Partial<Draft>;
  }>({
    open: false,
    editing: null,
  });

  const openNew = useCallback(
    (defaults?: Partial<Draft>) => setState({ open: true, editing: null, defaults }),
    [],
  );
  const openEdit = useCallback((tx: Transaction) => setState({ open: true, editing: tx }), []);
  const value = useMemo(() => ({ openNew, openEdit }), [openNew, openEdit]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key.toLowerCase() !== "n" || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el?.closest("input, textarea, select, [contenteditable], dialog[open]")) return;
      e.preventDefault();
      openNew();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openNew]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <TransactionSheet
        open={state.open}
        editing={state.editing}
        defaults={state.defaults}
        onClose={() => setState((s) => ({ ...s, open: false }))}
      />
    </Ctx.Provider>
  );
}
