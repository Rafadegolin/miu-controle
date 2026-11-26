import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, CreditCard } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { Wordmark } from "./ui";

/** Tela de autenticação: formulário à esquerda; à direita, destaques do produto (desktop). */
export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid min-h-dvh bg-surface lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="flex flex-col px-5 py-7 sm:px-10">
        <Link to="/" className="self-start" aria-label="Miu Controle">
          <Wordmark />
        </Link>
        <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center gap-6 py-10">
          <div className="text-center">
            <h1 className="text-[30px] font-semibold leading-tight tracking-[-0.035em]">{title}</h1>
            {subtitle ? <p className="mt-2 text-muted">{subtitle}</p> : null}
          </div>
          {children}
        </div>
        <p className="text-center text-xs text-faint">Seus dados são só seus. Sem conectar banco.</p>
      </div>
      <Showcase />
    </div>
  );
}

/* ---------- vitrine (carrossel) ---------- */

const SLIDES: { title: ReactNode; text: string; visual: ReactNode }[] = [
  {
    title: (
      <>
        A fatura certa, <Underline>mês a mês</Underline>
      </>
    ),
    text: "Cada compra cai na fatura certa pelo dia de fechamento. Parcelas aparecem nos meses seguintes.",
    visual: <StatementMock />,
  },
  {
    title: (
      <>
        Saiba hoje como o <Underline>mês termina</Underline>
      </>
    ),
    text: "Salário, aluguel e assinaturas entram como previstos. O saldo do fim do mês já desconta tudo.",
    visual: <ProjectionMock />,
  },
  {
    title: (
      <>
        Gaste no <Underline>ritmo certo</Underline>
      </>
    ),
    text: "Compare o mês atual com o anterior e veja quanto ainda dá para gastar por dia.",
    visual: <PaceMock />,
  },
];

function Underline({ children }: { children: ReactNode }) {
  return (
    <span className="relative whitespace-nowrap">
      {children}
      <svg
        className="absolute -bottom-1.5 left-0 h-2 w-full text-primary"
        viewBox="0 0 200 8"
        preserveAspectRatio="none"
        aria-hidden
      >
        <path
          d="M2 5.5 Q 100 1 198 4.5"
          stroke="currentColor"
          strokeWidth="2.5"
          fill="none"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

function Showcase() {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const n = SLIDES.length;
  const go = (d: number) => setI((x) => (x + d + n) % n);

  useEffect(() => {
    if (paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setI((x) => (x + 1) % SLIDES.length), 6000);
    return () => clearInterval(t);
  }, [paused]);

  const slide = SLIDES[i] ?? SLIDES[0];
  if (!slide) return null;
  return (
    <aside
      className="relative hidden flex-col items-center justify-center overflow-hidden bg-bg px-10 lg:flex"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-roledescription="carrossel"
      aria-label="O que o Miu faz"
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-2/3 bg-[radial-gradient(60%_60%_at_50%_30%,var(--accent-soft),transparent)]"
        aria-hidden
      />
      <div className="relative flex w-full max-w-[460px] flex-col items-center gap-10">
        <div key={i} className="w-full animate-[fadeUp_.45s_ease]">
          {slide.visual}
        </div>
        <div className="text-center" aria-live="polite">
          <h2 className="text-[30px] font-semibold leading-tight tracking-[-0.035em]">{slide.title}</h2>
          <p className="mx-auto mt-4 max-w-[380px] text-muted">{slide.text}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label="Anterior"
            className="grid size-8 place-items-center rounded-full bg-surface text-muted shadow-card hover:text-fg"
          >
            <ChevronLeft className="size-4" />
          </button>
          {SLIDES.map((_, k) => (
            <button
              // biome-ignore lint/suspicious/noArrayIndexKey: os slides são fixos
              key={k}
              type="button"
              aria-label={`Destaque ${k + 1}`}
              aria-current={k === i}
              onClick={() => setI(k)}
              className={cn(
                "h-1.5 rounded-full transition-all",
                k === i ? "w-7 bg-primary" : "w-1.5 bg-line-strong",
              )}
            />
          ))}
          <button
            type="button"
            onClick={() => go(1)}
            aria-label="Próximo"
            className="grid size-8 place-items-center rounded-full bg-surface text-muted shadow-card hover:text-fg"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}

/* ---------- mini-mockups (dados ilustrativos) ---------- */

function MockCard({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-[22px] bg-surface p-5 shadow-pop", className)}>{children}</div>;
}

function StatementMock() {
  const rows = [
    { d: "Notebook", m: "5/10", v: "R$ 480,00" },
    { d: "Geladeira", m: "3/6", v: "R$ 533,33" },
    { d: "Mercado", m: "", v: "R$ 412,90" },
  ];
  return (
    <MockCard>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm text-muted">
          <CreditCard className="size-4" aria-hidden /> Fatura de dezembro
        </span>
        <span className="rounded-full bg-warn-soft px-2 py-0.5 text-xs font-medium text-warn">Fechada</span>
      </div>
      <p className="num-display mt-2 text-[34px]">R$ 1.426,23</p>
      <p className="text-[13px] text-muted">Fecha dia 3 · vence dia 10</p>
      <ul className="mt-4 divide-y divide-line">
        {rows.map((r) => (
          <li key={r.d} className="flex items-center gap-2 py-2.5 text-sm">
            <span className="flex-1">{r.d}</span>
            {r.m ? <span className="rounded-full bg-surface-2 px-2 text-xs text-muted">{r.m}</span> : null}
            <span className="num font-medium">{r.v}</span>
          </li>
        ))}
      </ul>
    </MockCard>
  );
}

function ProjectionMock() {
  return (
    <MockCard>
      <p className="text-sm text-muted">Saldo em contas</p>
      <p className="num-display mt-1 text-[34px]">R$ 4.940,00</p>
      <div className="mt-4 flex flex-col gap-2 text-sm">
        {[
          ["Salário (previsto)", "+ R$ 7.800,00", "text-accent"],
          ["Aluguel (previsto)", "− R$ 2.100,00", ""],
          ["Fatura do cartão", "− R$ 1.426,23", ""],
        ].map(([l, v, c]) => (
          <div key={l} className="flex justify-between rounded-[12px] bg-surface-2 px-3 py-2.5">
            <span className="text-fg-2">{l}</span>
            <span className={cn("num font-medium", c)}>{v}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
        <span className="text-sm text-muted">Previsto para 31/12</span>
        <span className="num text-lg font-semibold">R$ 9.213,77</span>
      </div>
    </MockCard>
  );
}

function PaceMock() {
  return (
    <MockCard>
      <p className="text-sm text-muted">Gastos no mês</p>
      <p className="num-display mt-1 text-[34px]">
        R$ 2.103 <span className="text-lg font-medium tracking-normal text-muted">/ R$ 3.000</span>
      </p>
      <svg viewBox="0 0 300 110" className="mt-3 w-full" aria-hidden>
        <path
          d="M0 95 L300 25"
          stroke="var(--line-strong)"
          strokeDasharray="4 5"
          strokeWidth="1.5"
          fill="none"
        />
        <path d="M0 100 C 50 98 70 70 110 62 S 170 52 200 48 L200 110 L0 110 Z" fill="var(--accent-soft)" />
        <path
          d="M0 100 C 50 98 70 70 110 62 S 170 52 200 48"
          stroke="var(--primary)"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
        />
        <circle cx="200" cy="48" r="5" fill="var(--surface)" stroke="var(--primary)" strokeWidth="2.5" />
      </svg>
      <div className="mt-2 flex items-center justify-between text-sm">
        <span className="rounded-full bg-accent-soft px-2.5 py-1 font-medium text-accent">R$ 600 abaixo</span>
        <span className="text-muted">
          até <b className="num text-fg">R$ 80</b> por dia
        </span>
      </div>
    </MockCard>
  );
}
