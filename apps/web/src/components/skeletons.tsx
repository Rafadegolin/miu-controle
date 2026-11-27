import { cn } from "@/lib/cn";
import { Card } from "./ui";

/*
 * Esqueletos das telas: mesmo desenho e mesmas alturas da tela pronta, para nada mudar de lugar
 * quando os dados chegam. O brilho vem de .skeleton (styles.css).
 */

export function Skeleton({ className }: { className?: string }) {
  return <span className={cn("skeleton block rounded-md", className)} aria-hidden />;
}

/** Card genérico: título, número grande e algumas linhas. */
function CardBlock({ className, lines = 3 }: { className?: string; lines?: number }) {
  return (
    <Card className={cn("flex flex-col gap-4 p-5", className)}>
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-9 w-44" />
      <div className="mt-auto flex flex-col gap-2.5">
        {Array.from({ length: lines }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: linhas fixas de esqueleto
          <Skeleton key={i} className={cn("h-3.5", i % 2 ? "w-2/3" : "w-full")} />
        ))}
      </div>
    </Card>
  );
}

function Loading({ children }: { children: React.ReactNode }) {
  return (
    <div className="contents" role="status" aria-label="Carregando">
      {children}
    </div>
  );
}

/** Visão geral: saudação + grade de cards. */
export function InicioSkeleton() {
  return (
    <Loading>
      <Skeleton className="-mt-4 h-5 w-64" />
      <div className="grid gap-5 lg:grid-cols-3">
        <CardBlock className="h-[372px]" lines={4} />
        <CardBlock className="h-[372px] lg:col-span-2" lines={5} />
        <CardBlock className="h-[260px]" />
        <CardBlock className="h-[260px]" />
        <CardBlock className="h-[260px]" />
      </div>
    </Loading>
  );
}

/** Lançamentos: mês, faixa de resumo, filtros e linhas da lista. */
export function ListaSkeleton() {
  return (
    <Loading>
      <Skeleton className="h-10 w-56 rounded-control" />
      <Card className="grid grid-cols-2 gap-y-4 p-5 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: colunas fixas
          <div key={i} className="flex flex-col gap-2 lg:px-5 lg:first:pl-0">
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-7 w-28" />
            <Skeleton className="h-3 w-24" />
          </div>
        ))}
      </Card>
      <div className="flex flex-wrap gap-2.5">
        <Skeleton className="h-[42px] min-w-[220px] flex-1 rounded-control" />
        <Skeleton className="h-[42px] w-72 rounded-control" />
      </div>
      <Card className="flex flex-col">
        {Array.from({ length: 8 }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: linhas fixas
          <div key={i} className="flex items-center gap-3 border-t border-line px-5 py-3 first:border-t-0">
            <Skeleton className="size-9 shrink-0 rounded-[10px]" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className={cn("h-3.5", i % 3 === 0 ? "w-40" : "w-28")} />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </Card>
    </Loading>
  );
}

/** Telas de cards (Contas, Cartões, Metas, Orçamentos, Recorrentes, Relatórios, Importar). */
export function CardsSkeleton({ hero = true }: { hero?: boolean }) {
  return (
    <Loading>
      {hero ? <CardBlock className="h-[280px]" lines={2} /> : null}
      <div className="grid gap-5 lg:grid-cols-2">
        <CardBlock className="h-[190px]" lines={2} />
        <CardBlock className="h-[190px]" lines={2} />
        <CardBlock className="h-[190px]" lines={2} />
        <CardBlock className="h-[190px]" lines={2} />
      </div>
    </Loading>
  );
}
