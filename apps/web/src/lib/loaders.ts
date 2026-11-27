import { todayIn } from "@miu/core";
import type { Me } from "@miu/shared";
import { onlineManager, type QueryClient } from "@tanstack/react-query";
import { meQuery } from "./me";

/**
 * Para usar no `loader` de uma rota: espera os dados essenciais antes de desenhar a tela, assim
 * nada "pula" de zero para o valor real. Com cache, volta na hora.
 * - Sem internet não espera (as consultas ficariam pausadas): a tela abre com o cache do aparelho.
 * - Com internet espera no máximo `timeoutMs`; depois disso o skeleton da rota assume.
 * Recebe as buscas já disparadas (ensureQueryData / ensureInfiniteQueryData).
 */
export async function awaitData(tasks: Promise<unknown>[], timeoutMs = 2500) {
  const all = Promise.all(tasks.map((t) => t.catch(() => undefined)));
  if (!onlineManager.isOnline()) return;
  await Promise.race([all, new Promise((resolve) => setTimeout(resolve, timeoutMs))]);
}

/** "Hoje" no fuso do usuário, a partir do `me` já em cache (o layout do app garante que existe). */
export function todayFor(queryClient: QueryClient) {
  const me = queryClient.getQueryData<Me | null>(meQuery.queryKey);
  return todayIn(me?.settings.timezone);
}
