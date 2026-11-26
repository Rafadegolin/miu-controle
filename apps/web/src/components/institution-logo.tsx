import { type AccountKind, CARD_BRANDS, type CardBrand, institutionBySlug } from "@miu/shared";
import { Banknote, CreditCard, Landmark, LineChart, PiggyBank } from "lucide-react";
import type { CSSProperties } from "react";
import { cn } from "@/lib/cn";

const KIND_ICON = {
  checking: Landmark,
  savings: PiggyBank,
  cash: Banknote,
  investment: LineChart,
  credit_card: CreditCard,
} satisfies Record<AccountKind, unknown>;

type LogoAccount = { institution?: string | null; kind: AccountKind; color: string; name?: string };

/**
 * Logo do banco da conta (arquivo em /bancos). Sem banco escolhido, mostra o ícone do tipo de
 * conta tingido na cor dela. As logos são <img>: SVG de terceiro não executa nada assim.
 */
export function InstitutionLogo({ account, className }: { account: LogoAccount; className?: string }) {
  const inst = institutionBySlug(account.institution);
  if (inst) {
    return (
      <img
        src={`/bancos/${inst.slug}.svg`}
        alt={inst.name}
        title={inst.name}
        loading="lazy"
        decoding="async"
        className={cn("size-9 shrink-0 rounded-[10px] bg-white object-cover ring-1 ring-line", className)}
      />
    );
  }
  const Icon = KIND_ICON[account.kind];
  return (
    <span
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-[10px] bg-[color-mix(in_srgb,var(--c)_15%,transparent)] text-(--c)",
        className,
      )}
      style={{ "--c": account.color } as CSSProperties}
      aria-hidden
    >
      <Icon className="size-[55%]" />
    </span>
  );
}

/** Bandeira do cartão sobre fundo branco (as cores das marcas pedem fundo claro). */
export function CardBrandMark({
  brand,
  className,
}: {
  brand: CardBrand | null | undefined;
  className?: string;
}) {
  const b = CARD_BRANDS.find((x) => x.slug === brand);
  if (!b) return null;
  return (
    <span
      className={cn(
        "inline-flex h-7 min-w-11 shrink-0 items-center justify-center rounded-md bg-white px-1.5 ring-1 ring-black/5",
        className,
      )}
      title={b.name}
    >
      {b.logo ? (
        <img src={`/bandeiras/${b.slug}.svg`} alt={b.name} className="h-4 w-auto max-w-10" />
      ) : (
        <span className="text-[11px] font-bold tracking-tight text-black/85">{b.name}</span>
      )}
    </span>
  );
}
