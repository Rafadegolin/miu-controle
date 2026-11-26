import { formatBRL } from "@miu/core";
import type { Health } from "@miu/shared";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { api } from "@/lib/api";

const healthQuery = queryOptions({
  queryKey: ["health"],
  queryFn: async (): Promise<Health> => {
    const res = await api.health.$get();
    // 503 também traz o corpo com o diagnóstico
    return (await res.json()) as Health;
  },
  staleTime: 0,
});

export const Route = createFileRoute("/status")({
  component: Fundacao,
});

function Fundacao() {
  const { data, isPending, isError, refetch, isFetching } = useQuery(healthQuery);

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 px-4 py-12">
      <div className="flex items-center gap-3">
        <img src="/favicon.svg" alt="" className="size-9" />
        <span className="text-lg font-semibold tracking-tight">Miu Controle</span>
      </div>

      <div>
        <h1 className="text-3xl font-semibold">Fundação no ar</h1>
        <p className="mt-2 text-muted">
          Worker, SPA e banco conectados. As telas do app entram a partir da Fase 1.
        </p>
      </div>

      <section className="rounded-card border border-line bg-surface p-5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted">Status do sistema</span>
          <button
            type="button"
            onClick={() => refetch()}
            className="rounded-control border border-line-strong px-3 py-1 text-sm hover:bg-surface-2"
          >
            {isFetching ? "Verificando…" : "Verificar de novo"}
          </button>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-y-3 text-sm">
          <dt className="text-muted">API</dt>
          <dd className="text-right">
            <Status ok={!isError && !isPending} pending={isPending} />
          </dd>
          <dt className="text-muted">Banco (Neon)</dt>
          <dd className="text-right">
            <Status ok={data?.banco.ok ?? false} pending={isPending} />
            {data?.banco.latenciaMs != null && (
              <span className="num ml-2 text-faint">{data.banco.latenciaMs} ms</span>
            )}
          </dd>
          <dt className="text-muted">Região do Worker</dt>
          <dd className="num text-right">{data?.colo ?? "—"}</dd>
          <dt className="text-muted">Versão</dt>
          <dd className="num truncate text-right font-mono text-xs leading-5">{data?.versao ?? "—"}</dd>
        </dl>
        {data?.banco.erro && <p className="mt-4 text-sm text-danger">{data.banco.erro}</p>}
      </section>

      <p className="num text-sm text-faint">Teste do pacote compartilhado: {formatBRL(123456)}</p>
    </main>
  );
}

function Status({ ok, pending }: { ok: boolean; pending: boolean }) {
  if (pending) return <span className="text-faint">…</span>;
  return ok ? (
    <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">Ok</span>
  ) : (
    <span className="rounded-full bg-danger-soft px-2 py-0.5 text-xs font-medium text-danger">Falhou</span>
  );
}
