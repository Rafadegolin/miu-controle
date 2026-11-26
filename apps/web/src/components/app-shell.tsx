import type { Me } from "@miu/shared";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  ArrowLeftRight,
  CreditCard,
  Ellipsis,
  Eye,
  EyeOff,
  LayoutGrid,
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
  Upload,
  Wallet,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { cn } from "@/lib/cn";
import { usePrivacy } from "@/lib/privacy";
import { getTheme, setTheme, type Theme } from "@/lib/theme";
import { QuickAddProvider, useQuickAdd } from "./quick-add";
import { Sheet } from "./sheet";
import { Toaster } from "./toast";
import { Wordmark } from "./ui";

type NavItem = { to: string; label: string; icon: LucideIcon; section: string; mobile?: boolean };

export const NAV: NavItem[] = [
  { to: "/inicio", label: "Visão geral", icon: LayoutGrid, section: "Organização", mobile: true },
  { to: "/lancamentos", label: "Lançamentos", icon: ArrowLeftRight, section: "Organização", mobile: true },
  { to: "/recorrentes", label: "Recorrentes", icon: Repeat, section: "Organização" },
  { to: "/contas", label: "Contas", icon: Wallet, section: "Controle financeiro" },
  { to: "/cartoes", label: "Cartões", icon: CreditCard, section: "Controle financeiro", mobile: true },
  { to: "/orcamentos", label: "Orçamentos", icon: PieChart, section: "Controle financeiro" },
  { to: "/metas", label: "Metas", icon: Target, section: "Controle financeiro" },
  { to: "/relatorios", label: "Relatórios", icon: TrendingUp, section: "Visão estratégica" },
  { to: "/importar", label: "Importar extrato", icon: Upload, section: "Ferramentas" },
  { to: "/configuracoes", label: "Configurações", icon: Settings, section: "Ferramentas" },
];

const THEME_NEXT: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };
const THEME_ICON = { system: Monitor, light: Sun, dark: Moon };
const THEME_LABEL = { system: "Tema do sistema", light: "Tema claro", dark: "Tema escuro" };

const iconButton =
  "grid size-10 place-items-center rounded-control text-muted transition hover:bg-surface-2 hover:text-fg";

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, set] = useState<Theme>(getTheme);
  const Icon = THEME_ICON[theme];
  return (
    <button
      type="button"
      className={cn(iconButton, className)}
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

/** Olho: esconde os valores para usar o app em público. */
export function PrivacyToggle({ className }: { className?: string }) {
  const [on, set] = usePrivacy();
  const Icon = on ? EyeOff : Eye;
  return (
    <button
      type="button"
      className={cn(iconButton, className)}
      aria-pressed={on}
      aria-label={on ? "Mostrar valores" : "Esconder valores"}
      title={on ? "Mostrar valores" : "Esconder valores"}
      onClick={() => set(!on)}
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

function useCurrent() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return NAV.find((n) => pathname.startsWith(n.to));
}

function Shell({ me, children }: { me: Me; children: ReactNode }) {
  const current = useCurrent();
  const { openNew } = useQuickAdd();
  const [moreOpen, setMoreOpen] = useState(false);
  const mobile = NAV.filter((n) => n.mobile);
  const more = NAV.filter((n) => !n.mobile);
  const moreActive = current ? more.includes(current) : false;
  const sections = [...new Set(NAV.map((n) => n.section))];

  return (
    <div className="grid min-h-dvh lg:grid-cols-[264px_minmax(0,1fr)]">
      {/* Barra lateral (desktop) */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-surface px-4 py-6 lg:flex">
        <div className="flex items-center justify-between px-2 pb-5">
          <Link to="/inicio" aria-label="Visão geral">
            <Wordmark />
          </Link>
          <PrivacyToggle />
        </div>
        <nav
          className="scroll-hover -mr-2 flex flex-1 flex-col gap-4 overflow-y-auto pr-2"
          aria-label="Principal"
        >
          {sections.map((section) => (
            <div key={section} className="flex flex-col gap-0.5">
              <p className="px-3 pb-1.5 text-[13px] text-faint">{section}</p>
              {NAV.filter((n) => n.section === section).map((item) => (
                <NavLink key={item.to} item={item} active={item === current} />
              ))}
            </div>
          ))}
        </nav>
        <div className="mt-4 flex items-center gap-3 rounded-[14px] px-2 pt-4">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft text-[13px] font-semibold text-accent">
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
        {/* Topo (celular): marca e atalhos */}
        <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur-md lg:hidden">
          <div className="flex h-14 items-center gap-1 px-4">
            <Link to="/inicio" aria-label="Visão geral" className="mr-auto">
              <Wordmark />
            </Link>
            <PrivacyToggle />
            <ThemeToggle />
            <Link to="/configuracoes" aria-label="Configurações" className={iconButton}>
              <Settings className="size-[18px]" aria-hidden />
            </Link>
          </div>
        </header>

        <main className="mx-auto flex max-w-[1240px] flex-col gap-6 px-4 pt-5 pb-28 sm:px-6 lg:px-10 lg:pt-9 lg:pb-14">
          {/* Título da página + ação principal */}
          <div className="flex items-center gap-3">
            <h1 className="text-[26px] font-semibold tracking-[-0.03em] lg:text-[30px]">{current?.label}</h1>
            <button
              type="button"
              onClick={() => openNew()}
              className="ml-auto hidden h-11 items-center gap-2 rounded-control bg-primary px-4 font-medium text-on-primary shadow-card transition hover:bg-primary-hover lg:inline-flex"
            >
              <Plus className="size-[18px]" aria-hidden /> Novo lançamento
              <kbd className="rounded-md border border-on-primary/30 px-1.5 font-mono text-[11px] opacity-80">
                N
              </kbd>
            </button>
          </div>
          {children}
        </main>
      </div>

      {/* Barra de baixo (celular) */}
      <nav
        className="fixed inset-x-0 bottom-0 z-25 grid border-t border-line bg-surface/95 px-2 pt-1.5 pb-[calc(6px+env(safe-area-inset-bottom))] backdrop-blur-md lg:hidden"
        style={{ gridTemplateColumns: `repeat(${mobile.length + 2}, minmax(0, 1fr))` }}
        aria-label="Principal"
      >
        {mobile.slice(0, 2).map((item) => (
          <MobileLink key={item.to} item={item} active={item === current} />
        ))}
        <button
          type="button"
          onClick={() => openNew()}
          aria-label="Novo lançamento"
          className="flex h-[52px] items-center justify-center"
        >
          <span className="-mt-4 grid size-[52px] place-items-center rounded-[18px] bg-primary text-on-primary shadow-pop">
            <Plus className="size-6" strokeWidth={2.2} aria-hidden />
          </span>
        </button>
        {mobile.slice(2).map((item) => (
          <MobileLink key={item.to} item={item} active={item === current} />
        ))}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-current={moreActive ? "page" : undefined}
          className={cn(
            "flex h-[52px] flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
            moreActive ? "text-primary" : "text-muted",
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
        active ? "text-primary" : "text-muted",
      )}
    >
      <Icon className="size-5" aria-hidden />
      {item.label === "Visão geral" ? "Início" : item.label}
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
        "flex h-10 items-center gap-3 rounded-[12px] px-3 text-[15px] transition",
        active ? "bg-accent-soft font-medium text-fg" : "text-fg-2 hover:bg-surface-2 hover:text-fg",
      )}
    >
      <Icon className={cn("size-[19px]", active ? "text-primary" : "text-faint")} aria-hidden />
      {item.label}
    </Link>
  );
}
