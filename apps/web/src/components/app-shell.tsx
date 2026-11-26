import type { Me } from "@miu/shared";
import { Link, useRouterState } from "@tanstack/react-router";
import { Home, type LucideIcon, Monitor, Moon, Settings, Sun } from "lucide-react";
import { type ReactNode, useState } from "react";
import { cn } from "@/lib/cn";
import { getTheme, setTheme, type Theme } from "@/lib/theme";
import { Logo } from "./ui";

type NavItem = { to: string; label: string; icon: LucideIcon; section?: string };

/** Itens entram aqui conforme cada fase fica pronta (contas, cartões, recorrentes, orçamentos…). */
export const NAV: NavItem[] = [
  { to: "/", label: "Início", icon: Home },
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
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const current = NAV.find((n) => (n.to === "/" ? pathname === "/" : pathname.startsWith(n.to)));
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
            <Link to="/" className="flex items-center gap-2 font-semibold lg:hidden">
              <Logo />
            </Link>
            <h1 className="text-[19px] font-semibold tracking-tight">{current?.label}</h1>
            <div className="ml-auto flex items-center gap-2">
              <ThemeToggle className="lg:hidden" />
            </div>
          </div>
        </header>
        <main className="mx-auto flex max-w-[1180px] flex-col gap-5 px-4 pt-6 pb-28 sm:px-6 lg:pb-12">
          {children}
        </main>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-25 grid grid-cols-2 border-t border-line bg-surface px-2 pt-1.5 pb-[calc(6px+env(safe-area-inset-bottom))] lg:hidden"
        aria-label="Principal"
      >
        {NAV.slice(0, 4).map((item) => {
          const Icon = item.icon;
          const active = item === current;
          return (
            <Link
              key={item.to}
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
        })}
      </nav>
    </div>
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
