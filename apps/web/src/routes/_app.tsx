import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { requireMe } from "@/lib/guards";
import { meQuery } from "@/lib/me";

export const Route = createFileRoute("/_app")({
  beforeLoad: ({ context }) => requireMe(context.queryClient),
  component: AppLayout,
});

function AppLayout() {
  const { data: me } = useSuspenseQuery(meQuery);
  if (!me) return null; // o beforeLoad já redirecionou
  return (
    <AppShell me={me}>
      <Outlet />
    </AppShell>
  );
}
