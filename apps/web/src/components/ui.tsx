import { type ComponentProps, forwardRef, type ReactNode, useId } from "react";
import { cn } from "@/lib/cn";

type ButtonProps = ComponentProps<"button"> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
};

const variants = {
  primary: "bg-accent-fill text-on-accent border-transparent hover:brightness-105",
  secondary: "bg-surface text-fg border-line-strong hover:bg-surface-2",
  ghost: "bg-transparent text-fg border-transparent hover:bg-surface-2",
  danger: "bg-transparent text-danger border-danger/35 hover:bg-danger-soft",
};
const sizes = {
  sm: "h-8 px-3 text-[13.5px] rounded-lg",
  md: "h-10 px-4 rounded-control",
  lg: "h-12 px-5 text-base rounded-xl",
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
        "inline-flex items-center justify-center gap-2 whitespace-nowrap border font-medium transition active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60",
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
        "h-[42px] w-full rounded-control border border-line-strong bg-surface px-3 outline-none transition placeholder:text-faint focus:border-accent focus:ring-3 focus:ring-accent/20 disabled:opacity-60 aria-invalid:border-danger",
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
        <label htmlFor={id} className="text-[13px] font-medium text-muted">
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

export function Card({ className, ...props }: ComponentProps<"section">) {
  return (
    <section className={cn("min-w-0 rounded-card border border-line bg-surface", className)} {...props} />
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
      className={cn("rounded-xl px-3.5 py-3 text-sm", tones[tone])}
    >
      {children}
    </div>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-7 shrink-0", className)} aria-hidden="true">
      <path
        d="M6 11 8.5 3.5 14 9.5h4l5.5-6L26 11v11a7 7 0 0 1-7 7h-6a7 7 0 0 1-7-7z"
        className="fill-accent-fill"
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
