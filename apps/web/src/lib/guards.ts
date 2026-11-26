import type { QueryClient } from "@tanstack/react-query";
import { redirect } from "@tanstack/react-router";
import { meQuery } from "./me";

/** Páginas de login/cadastro: quem já está logado vai direto para o app. */
export async function guestOnly(queryClient: QueryClient) {
  const me = await queryClient.ensureQueryData(meQuery);
  if (me) throw redirect({ to: "/" });
}

/** Páginas do app: exige sessão; sem onboarding concluído, manda para o onboarding. */
export async function requireMe(queryClient: QueryClient, { allowOnboarding = false } = {}) {
  const me = await queryClient.ensureQueryData(meQuery);
  if (!me) throw redirect({ to: "/entrar" });
  if (!allowOnboarding && !me.settings.onboardingCompleted) throw redirect({ to: "/onboarding" });
  return me;
}
