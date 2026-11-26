import { parseBRL } from "@miu/core";
import type { Pace } from "@miu/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { meQuery, updateMe } from "@/lib/me";
import { toast } from "./toast";
import { Button } from "./ui";

/** Reais sem centavos para números de destaque ("R$ 8.537"). */
export const whole = (cents: number) =>
  `${cents < 0 ? "-" : ""}R$ ${Math.round(Math.abs(cents) / 100).toLocaleString("pt-BR")}`;

/** Valor para campo de texto ("3.000,00"). */
const plain = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Formulário do limite de gastos do mês (com sugestão da média de 3 meses). */
export function LimitForm({ pace, onDone }: { pace: Pace; onDone?: () => void }) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState(pace.limitCents ? plain(pace.limitCents) : "");
  const save = useMutation({
    mutationFn: (cents: number | null) => updateMe({ monthlySpendingLimitCents: cents }),
    onSuccess: async (me) => {
      queryClient.setQueryData(meQuery.queryKey, me);
      await queryClient.invalidateQueries({ queryKey: ["pace"] });
      toast(me.settings.monthlySpendingLimitCents ? "Limite do mês salvo" : "Limite removido");
      onDone?.();
    },
  });
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const cents = parseBRL(value);
        if (cents && cents > 0) save.mutate(cents);
      }}
    >
      <label htmlFor="limite-mes" className="text-[13px] font-medium text-fg-2">
        Limite de gastos do mês
      </label>
      <div className="flex gap-2">
        <input
          id="limite-mes"
          // biome-ignore lint/a11y/noAutofocus: abre direto no campo
          autoFocus
          inputMode="decimal"
          placeholder="3.000,00"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="num h-10 min-w-0 flex-1 rounded-control border border-line-strong bg-surface px-3"
        />
        <Button type="submit" variant="primary" loading={save.isPending}>
          Salvar
        </Button>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
        {pace.averageCents > 0 ? (
          <button
            type="button"
            className="text-primary hover:underline"
            onClick={() => setValue(plain(pace.averageCents))}
          >
            Usar sua média de 3 meses ({whole(pace.averageCents)})
          </button>
        ) : null}
        {pace.limitCents ? (
          <button type="button" className="text-muted hover:underline" onClick={() => save.mutate(null)}>
            Remover limite
          </button>
        ) : null}
        {onDone ? (
          <button type="button" className="text-muted hover:underline" onClick={onDone}>
            Cancelar
          </button>
        ) : null}
      </div>
    </form>
  );
}
