import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { monthLabel } from "@/lib/format";

/** Botões segmentados (um escolhido de poucos). */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string; disabled?: boolean }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <fieldset className="inline-flex w-fit flex-wrap gap-0.5 rounded-[11px] border border-line bg-surface-2 p-[3px]">
      <legend className="sr-only">{label}</legend>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-8 rounded-lg border px-3 text-sm font-medium transition disabled:opacity-40",
            value === o.value
              ? "border-line bg-surface text-fg shadow-sm"
              : "border-transparent text-muted hover:text-fg",
          )}
        >
          {o.label}
        </button>
      ))}
    </fieldset>
  );
}

export function Chip({
  pressed,
  onClick,
  color,
  children,
}: {
  pressed?: boolean;
  onClick?: () => void;
  color?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "inline-flex h-[34px] items-center gap-1.5 rounded-full border px-3 text-sm transition",
        pressed
          ? "border-primary bg-accent-soft text-fg"
          : "border-line-strong bg-surface text-fg-2 hover:bg-surface-2",
      )}
    >
      {color ? <span className="size-2 rounded-full" style={{ background: color }} aria-hidden /> : null}
      {children}
    </button>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-6 w-10 shrink-0 rounded-full transition disabled:opacity-50",
        checked ? "bg-primary" : "bg-line-strong",
      )}
    >
      <span
        className={cn(
          "absolute top-[3px] left-[3px] size-[18px] rounded-full bg-surface shadow transition-transform",
          checked && "translate-x-4",
        )}
      />
    </button>
  );
}

export function MonthSwitcher({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  const shift = (n: number) => {
    const [y, m] = month.split("-").map(Number) as [number, number];
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    onChange(d.toISOString().slice(0, 7));
  };
  return (
    <fieldset className="inline-flex h-[38px] items-center rounded-control border border-line-strong bg-surface">
      <legend className="sr-only">Mês</legend>
      <button
        type="button"
        onClick={() => shift(-1)}
        className="grid h-9 w-[34px] place-items-center rounded-[9px] text-muted hover:bg-surface-2 hover:text-fg"
        aria-label="Mês anterior"
      >
        <ChevronLeft className="size-[18px]" />
      </button>
      <span className="min-w-[118px] text-center text-sm font-medium capitalize">{monthLabel(month)}</span>
      <button
        type="button"
        onClick={() => shift(1)}
        className="grid h-9 w-[34px] place-items-center rounded-[9px] text-muted hover:bg-surface-2 hover:text-fg"
        aria-label="Próximo mês"
      >
        <ChevronRight className="size-[18px]" />
      </button>
    </fieldset>
  );
}

/** Campo de valor "estilo app de banco": cada dígito empurra os centavos (1, 12, 1,23…). */
export function AmountInput({
  id,
  cents,
  onChange,
  invalid,
  autoFocus,
}: {
  id: string;
  cents: number;
  onChange: (cents: number) => void;
  invalid?: boolean;
  autoFocus?: boolean;
}) {
  const text = (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <div
      className={cn(
        "flex items-baseline gap-2 border-b-2 pb-1.5 focus-within:border-primary",
        invalid ? "border-danger" : "border-line-strong",
      )}
    >
      <span className="text-[22px] font-medium text-muted">R$</span>
      <input
        id={id}
        inputMode="numeric"
        autoComplete="off"
        // biome-ignore lint/a11y/noAutofocus: o valor é o primeiro campo do lançamento rápido
        autoFocus={autoFocus}
        data-autofocus={autoFocus || undefined}
        value={text}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "").slice(0, 12);
          onChange(Number(digits || "0"));
        }}
        onFocus={(e) => {
          const el = e.currentTarget;
          requestAnimationFrame(() => el.setSelectionRange(el.value.length, el.value.length));
        }}
        className="num w-full min-w-0 bg-transparent text-[40px] font-semibold tracking-[-0.03em] outline-none"
      />
    </div>
  );
}
