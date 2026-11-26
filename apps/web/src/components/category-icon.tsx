import type { CategoryIcon as IconName } from "@miu/shared";
import { ArrowLeftRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { MiuIcon } from "./miu-icons";

/** Ícone da categoria (próprio do Miu) ou setas, em transferências. */
function Glyph({
  icon,
  transfer,
  className,
}: {
  icon?: IconName | undefined;
  transfer?: boolean;
  className?: string;
}) {
  return transfer ? (
    <ArrowLeftRight className={className} aria-hidden />
  ) : (
    <MiuIcon name={icon ?? "ellipsis"} className={className} />
  );
}

/** Quadrado com o ícone na cor da categoria (fundo tingido, funciona nos dois temas). */
export function IconTile({
  icon,
  color,
  transfer,
  className,
}: {
  icon?: IconName | undefined;
  color?: string | undefined;
  transfer?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-[10px] bg-[color-mix(in_srgb,var(--c)_15%,transparent)] text-(--c)",
        className,
      )}
      style={{ "--c": color ?? "var(--muted)" } as React.CSSProperties}
      aria-hidden
    >
      <Glyph icon={icon} transfer={transfer} className="size-[18px]" />
    </span>
  );
}

/** Pílula com ícone e nome da categoria, tingida na cor dela. */
export function CategoryBadge({
  icon,
  color,
  name,
  transfer,
}: {
  icon?: IconName | undefined;
  color?: string | undefined;
  name: string;
  transfer?: boolean;
}) {
  return (
    <span
      className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-[color-mix(in_srgb,var(--c)_13%,transparent)] py-1 pr-2.5 pl-2 text-[13px] font-medium text-fg-2"
      style={{ "--c": color ?? "var(--muted)" } as React.CSSProperties}
    >
      <Glyph icon={icon} transfer={transfer} className="size-3.5 shrink-0 text-(--c)" />
      <span className="truncate">{name}</span>
    </span>
  );
}
