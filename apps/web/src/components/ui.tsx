import { TrendingDown, TrendingUp } from "lucide-react";
import { type ComponentProps, forwardRef, type ReactNode, useId } from "react";
import { cn } from "@/lib/cn";

type ButtonProps = ComponentProps<"button"> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg" | "icon";
  loading?: boolean;
};

const variants = {
  primary: "bg-primary text-on-primary border-transparent hover:bg-primary-hover",
  secondary: "bg-surface text-fg border-line-strong hover:bg-surface-2",
  ghost: "bg-transparent text-fg border-transparent hover:bg-surface-2",
  danger: "bg-transparent text-danger border-danger/35 hover:bg-danger-soft",
};
const sizes = {
  sm: "h-8 px-3 text-[13.5px] rounded-[10px]",
  md: "h-10 px-4 rounded-control",
  lg: "h-12 px-5 text-base rounded-[14px]",
  icon: "size-10 rounded-control",
};

export function Button({
  variant = "secondary",
  size = "md",
  loading,
  disabled,
  className,
  children,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap border font-medium transition duration-150 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading ? (
        <span className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
      ) : null}
      {children}
    </button>
  );
}

export const Input = forwardRef<HTMLInputElement, ComponentProps<"input"> & { invalid?: boolean }>(
  ({ className, invalid, ...props }, ref) => (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        "h-11 w-full rounded-control border border-line-strong bg-surface px-3.5 outline-none transition placeholder:text-faint focus:border-primary focus:ring-4 focus:ring-primary/12 disabled:opacity-60 aria-invalid:border-danger",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

/** Campo com rótulo, dica e erro ligados ao input por id (acessível). */
export function Field({
  label,
  hint,
  error,
  aside,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  aside?: ReactNode;
  children: (props: { id: string; "aria-describedby"?: string; invalid: boolean }) => ReactNode;
}) {
  const id = useId();
  const descId = `${id}-desc`;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-[13px] font-medium text-fg-2">
          {label}
        </label>
        {aside}
      </div>
      {children({ id, "aria-describedby": hint || error ? descId : undefined, invalid: Boolean(error) })}
      {error ? (
        <p id={descId} className="text-[13px] text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={descId} className="text-[13px] text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Superfície padrão: branco, sem borda, sombra bem leve, raio 20. */
export function Card({ className, ...props }: ComponentProps<"section">) {
  return (
    <section
      className={cn("min-w-0 rounded-card bg-surface shadow-card ring-1 ring-card-ring", className)}
      {...props}
    />
  );
}

/** Título pequeno de card ("Gastos no mês", "Faturas"...). */
export function CardTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h3 className="text-[15px] font-medium tracking-normal text-muted">{children}</h3>
      {aside}
    </div>
  );
}

/** Variação em pill: "+3%" verde quando é bom, vermelho quando é ruim. */
export function DeltaPill({ value, goodWhen = "up" }: { value: number | null; goodWhen?: "up" | "down" }) {
  if (value === null || !Number.isFinite(value)) return null;
  const pct = Math.round(value * 100);
  const up = pct >= 0;
  const good = goodWhen === "up" ? up : !up;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span
      className={cn(
        "num inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[13px] font-medium",
        pct === 0
          ? "bg-surface-2 text-muted"
          : good
            ? "bg-accent-soft text-accent"
            : "bg-danger-soft text-danger",
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {up ? "+" : ""}
      {pct}%
    </span>
  );
}

export function Alert({
  tone = "danger",
  children,
}: {
  tone?: "danger" | "ok" | "info";
  children: ReactNode;
}) {
  const tones = {
    danger: "bg-danger-soft text-danger",
    ok: "bg-accent-soft text-accent",
    info: "bg-surface-2 text-fg-2",
  };
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn("rounded-[14px] px-4 py-3 text-sm", tones[tone])}
    >
      {children}
    </div>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-7 shrink-0", className)} aria-hidden="true">
      {/* Contorno da mesma cor com junção redonda: arredonda pontas e cantos sem mudar a silhueta. */}
      <path
        d="M6 11 8.5 3.5l4.8 5.2q.7.8 1.7.8h2q1 0 1.7-.8l4.8-5.2L26 11v11a7 7 0 0 1-7 7h-6a7 7 0 0 1-7-7z"
        className="fill-accent-fill stroke-accent-fill"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path
        d="M11.5 17.5h.01M20.5 17.5h.01"
        className="stroke-on-accent"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path
        d="M14 21.5q2 1.6 4 0"
        className="stroke-on-accent"
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Logo + nome. Minúsculo e arredondado, como o gato. */
export function Wordmark({ className, size = "md" }: { className?: string; size?: "md" | "lg" }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <Logo className={size === "lg" ? "size-9" : "size-8"} />
      <span
        className={cn(
          "font-semibold lowercase tracking-[-0.045em] text-fg",
          size === "lg" ? "text-[28px]" : "text-[24px]",
        )}
      >
        miu
      </span>
    </span>
  );
}
