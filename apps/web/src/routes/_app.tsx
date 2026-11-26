import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Navigate, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { requireMe } from "@/lib/guards";
import { meQuery } from "@/lib/me";

export const Route = createFileRoute("/_app")({
  beforeLoad: ({ context }) => requireMe(context.queryClient),
  component: AppLayout,
});

function AppLayout() {
  const { data: me } = useSuspenseQuery(meQuery);
  // Sessão acabou enquanto o app estava aberto (ou o cache do aparelho estava velho).
  if (!me) return <Navigate to="/entrar" />;
  return (
    <AppShell me={me}>
      <Outlet />
    </AppShell>
  );
}
