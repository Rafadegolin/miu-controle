import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Logo } from "./ui";

/** Tela de autenticação: formulário à esquerda, um recorte do produto à direita (desktop). */
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
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="flex flex-col px-4 py-7 sm:px-8">
        <Link to="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
          <Logo /> Miu Controle
        </Link>
        <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center gap-5 py-10">
          <div>
            <h1 className="text-[30px] font-semibold leading-tight tracking-[-0.035em]">{title}</h1>
            {subtitle ? <p className="mt-2 text-muted">{subtitle}</p> : null}
          </div>
          {children}
        </div>
      </div>
      <aside className="hidden items-center justify-center border-l border-line bg-surface p-10 lg:flex">
        <div className="flex w-full max-w-[420px] flex-col gap-4" aria-hidden="true">
          <div className="rounded-card border border-line bg-bg p-5">
            <p className="text-[13px] font-medium text-muted">Previsto para o fim do mês</p>
            <p className="num mt-1 text-[40px] font-semibold leading-none tracking-[-0.035em]">R$ 6.912,40</p>
            <p className="mt-2 text-[13px] text-muted">já descontando aluguel, contas fixas e as faturas</p>
          </div>
          <div className="relative flex aspect-[1.586] flex-col justify-between overflow-hidden rounded-2xl bg-gradient-to-br from-fg-2 to-fg p-5 text-bg">
            <div className="flex justify-between">
              <span className="h-[26px] w-[34px] rounded-md bg-bg/40" />
              <span className="font-semibold">Fatura de dezembro</span>
            </div>
            <div>
              <p className="text-xs opacity-75">Fecha dia 3 · vence dia 10</p>
              <p className="num text-[26px] font-semibold tracking-[-0.03em]">R$ 1.842,17</p>
              <p className="text-xs opacity-75">Notebook 5/10 · Geladeira 3/6</p>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
