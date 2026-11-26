import type { Me } from "@miu/shared";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  CreditCard,
  Ellipsis,
  Home,
  List,
  type LucideIcon,
  Monitor,
  Moon,
  PieChart,
  Plus,
  Repeat,
  Settings,
  Sun,
  Target,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { cn } from "@/lib/cn";
import { getTheme, setTheme, type Theme } from "@/lib/theme";
import { QuickAddProvider, useQuickAdd } from "./quick-add";
import { Sheet } from "./sheet";
import { Toaster } from "./toast";
import { Logo } from "./ui";

type NavItem = { to: string; label: string; icon: LucideIcon; section?: string; mobile?: boolean };

/** Itens entram aqui conforme cada fase fica pronta (cartões, recorrentes, orçamentos…). */
export const NAV: NavItem[] = [
  { to: "/", label: "Início", icon: Home, mobile: true },
  { to: "/lancamentos", label: "Lançamentos", icon: List, mobile: true },
  { to: "/contas", label: "Contas", icon: Wallet, section: "Dinheiro" },
  { to: "/cartoes", label: "Cartões", icon: CreditCard, section: "Dinheiro", mobile: true },
  { to: "/recorrentes", label: "Recorrentes", icon: Repeat, section: "Planejamento" },
  { to: "/orcamentos", label: "Orçamentos", icon: PieChart, section: "Planejamento" },
  { to: "/metas", label: "Metas", icon: Target, section: "Planejamento" },
  { to: "/relatorios", label: "Relatórios", icon: TrendingUp, section: "Planejamento" },
  { to: "/configuracoes", label: "Configurações", icon: Settings, section: "Conta" },
];

const THEME_NEXT: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };
const THEME_ICON = { system: Monitor, light: Sun, dark: Moon };
const THEME_LABEL = { system: "Tema do sistema", light: "Tema claro", dark: "Tema escuro" };

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, set] = useState<Theme>(getTheme);
  const Icon = THEME_ICON[theme];
  return (
    <button
      type="button"
      className={cn(
        "grid size-[38px] place-items-center rounded-control text-fg-2 hover:bg-surface-2",
        className,
      )}
      aria-label={`${THEME_LABEL[theme]}. Trocar tema`}
      title={THEME_LABEL[theme]}
      onClick={() => {
        const next = THEME_NEXT[theme];
        setTheme(next);
        set(next);
      }}
    >
      <Icon className="size-[18px]" aria-hidden />
    </button>
  );
}

function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

export function AppShell({ me, children }: { me: Me; children: ReactNode }) {
  return (
    <QuickAddProvider>
      <Shell me={me}>{children}</Shell>
      <Toaster />
    </QuickAddProvider>
  );
}

function Shell({ me, children }: { me: Me; children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const current = NAV.find((n) => (n.to === "/" ? pathname === "/" : pathname.startsWith(n.to)));
  const { openNew } = useQuickAdd();
  const mobile = NAV.filter((n) => n.mobile);
  const more = NAV.filter((n) => !n.mobile);
  const half = Math.ceil((mobile.length + 1) / 2);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = more.includes(current as NavItem);
  let lastSection: string | undefined;

  return (
    <div className="grid min-h-dvh lg:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh flex-col gap-1 border-r border-line bg-surface px-3 py-[18px] lg:flex">
        <Link
          to="/"
          className="flex items-center gap-2.5 px-2.5 pb-4 text-[17px] font-semibold tracking-tight"
        >
          <Logo /> Miu Controle
        </Link>
        <nav className="flex flex-col gap-0.5" aria-label="Principal">
          {NAV.map((item) => {
            const header = item.section && item.section !== lastSection ? item.section : null;
            lastSection = item.section ?? lastSection;
            return (
              <div key={item.to}>
                {header ? (
                  <p className="px-3 pt-3.5 pb-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
                    {header}
                  </p>
                ) : null}
                <NavLink item={item} active={item === current} />
              </div>
            );
          })}
        </nav>
        <div className="mt-auto flex items-center gap-2.5 border-t border-line px-2.5 pt-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-soft text-[13px] font-semibold text-accent">
            {initials(me.name)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{me.name}</span>
            <span className="block truncate text-xs text-faint">{me.email}</span>
          </span>
          <ThemeToggle />
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-20 border-b border-line bg-bg/90 backdrop-blur-md">
          <div className="mx-auto flex h-16 max-w-[1180px] items-center gap-3 px-4 sm:px-6">
            <Link to="/" className="flex items-center gap-2 font-semibold lg:hidden" aria-label="Início">
              <Logo />
            </Link>
            <h1 className="text-[19px] font-semibold tracking-tight">{current?.label}</h1>
            <div className="ml-auto flex items-center gap-2">
              <ThemeToggle className="lg:hidden" />
              <Link
                to="/configuracoes"
                aria-label="Configurações"
                className="grid size-[38px] place-items-center rounded-control text-fg-2 hover:bg-surface-2 lg:hidden"
              >
                <Settings className="size-[18px]" aria-hidden />
              </Link>
              <button
                type="button"
                onClick={() => openNew()}
                className="hidden h-10 items-center gap-2 rounded-control bg-accent-fill px-4 font-medium text-on-accent hover:brightness-105 lg:inline-flex"
              >
                <Plus className="size-[18px]" aria-hidden /> Novo lançamento
                <kbd className="rounded border border-on-accent/30 px-1.5 font-mono text-[11px] opacity-75">
                  N
                </kbd>
              </button>
            </div>
          </div>
        </header>
        <main className="mx-auto flex max-w-[1180px] flex-col gap-5 px-4 pt-6 pb-28 sm:px-6 lg:pb-12">
          {children}
        </main>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-25 grid border-t border-line bg-surface px-2 pt-1.5 pb-[calc(6px+env(safe-area-inset-bottom))] lg:hidden"
        style={{ gridTemplateColumns: `repeat(${mobile.length + 2}, minmax(0, 1fr))` }}
        aria-label="Principal"
      >
        {mobile.slice(0, half).map((item) => (
          <MobileLink key={item.to} item={item} active={item === current} />
        ))}
        <button
          type="button"
          onClick={() => openNew()}
          aria-label="Novo lançamento"
          className="flex h-[52px] items-center justify-center"
        >
          <span className="-mt-3.5 grid size-12 place-items-center rounded-2xl bg-accent-fill text-on-accent shadow-lg">
            <Plus className="size-[22px]" strokeWidth={2.2} aria-hidden />
          </span>
        </button>
        {mobile.slice(half).map((item) => (
          <MobileLink key={item.to} item={item} active={item === current} />
        ))}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-current={moreActive ? "page" : undefined}
          className={cn(
            "flex h-[52px] flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
            moreActive ? "text-accent" : "text-muted",
          )}
        >
          <Ellipsis className="size-5" aria-hidden />
          Mais
        </button>
      </nav>
      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="Mais">
        <nav className="flex flex-col gap-0.5" aria-label="Mais opções">
          {more.map((item) => (
            <span key={item.to} onClickCapture={() => setMoreOpen(false)}>
              <NavLink item={item} active={item === current} />
            </span>
          ))}
        </nav>
      </Sheet>
    </div>
  );
}

function MobileLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-[52px] flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
        active ? "text-accent" : "text-muted",
      )}
    >
      <Icon className="size-5" aria-hidden />
      {item.label}
    </Link>
  );
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-[38px] items-center gap-3 rounded-[9px] px-3 text-[14.5px] font-medium transition",
        active ? "bg-accent-soft text-fg" : "text-fg-2 hover:bg-surface-2 hover:text-fg",
      )}
    >
      <Icon className={cn("size-[18px]", active && "text-accent")} aria-hidden />
      {item.label}
    </Link>
  );
}
