import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, HeadContent, Link, Outlet } from "@tanstack/react-router";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: () => (
    <>
      <HeadContent />
      <Outlet />
    </>
  ),
  notFoundComponent: () => (
    <main className="grid min-h-dvh place-items-center p-6 text-center">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Página não encontrada</h1>
        <Link className="text-accent" to="/">
          Voltar para o início
        </Link>
      </div>
    </main>
  ),
  errorComponent: ({ error, reset }) => (
    <main className="grid min-h-dvh place-items-center p-6 text-center">
      <div className="flex max-w-sm flex-col items-center gap-3">
        <h1 className="text-2xl font-semibold">Algo deu errado</h1>
        <p className="text-muted">Recarregue a página. Se continuar, tente de novo em alguns minutos.</p>
        {import.meta.env.DEV ? (
          <pre className="max-w-full overflow-auto text-left text-xs text-danger">{String(error)}</pre>
        ) : null}
        <button type="button" className="text-accent" onClick={reset}>
          Tentar de novo
        </button>
      </div>
    </main>
  ),
});
