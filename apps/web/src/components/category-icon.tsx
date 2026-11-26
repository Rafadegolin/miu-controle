import type { CategoryIcon as IconName } from "@miu/shared";
import {
  ArrowLeftRight,
  Baby,
  Briefcase,
  Car,
  Clapperboard,
  Coffee,
  Dumbbell,
  Ellipsis,
  Fuel,
  Gift,
  GraduationCap,
  HeartPulse,
  House,
  type LucideIcon,
  PawPrint,
  PiggyBank,
  Plane,
  Receipt,
  Shirt,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  TrendingUp,
  Tv,
  Utensils,
  Wrench,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/cn";

/** Mapa fechado: importar ícone por nome dinâmico puxaria a biblioteca inteira. */
export const ICONS: Record<IconName, LucideIcon> = {
  house: House,
  "shopping-cart": ShoppingCart,
  utensils: Utensils,
  car: Car,
  "heart-pulse": HeartPulse,
  clapperboard: Clapperboard,
  "shopping-bag": ShoppingBag,
  tv: Tv,
  "graduation-cap": GraduationCap,
  briefcase: Briefcase,
  zap: Zap,
  "trending-up": TrendingUp,
  "piggy-bank": PiggyBank,
  gift: Gift,
  plane: Plane,
  "paw-print": PawPrint,
  baby: Baby,
  dumbbell: Dumbbell,
  receipt: Receipt,
  shirt: Shirt,
  fuel: Fuel,
  coffee: Coffee,
  smartphone: Smartphone,
  wrench: Wrench,
  ellipsis: Ellipsis,
};

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
  const Icon = transfer ? ArrowLeftRight : ICONS[icon ?? "ellipsis"];
  return (
    <span
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-[10px] bg-[color-mix(in_srgb,var(--c)_15%,transparent)] text-(--c)",
        className,
      )}
      style={{ "--c": color ?? "var(--muted)" } as React.CSSProperties}
      aria-hidden
    >
      <Icon className="size-[18px]" />
    </span>
  );
}
