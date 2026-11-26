import type { Me, UpdateMe } from "@miu/shared";
import { queryOptions } from "@tanstack/react-query";
import { api } from "./api";
import { ApiRequestError, readJson } from "./http";

/** Usuário logado + configurações. `null` quando não há sessão. */
export const meQuery = queryOptions({
  queryKey: ["me"],
  queryFn: async (): Promise<Me | null> => {
    const res = await api.me.$get();
    if (res.status === 401) return null;
    return readJson<Me>(res);
  },
  staleTime: 5 * 60_000,
});

export async function updateMe(body: UpdateMe): Promise<Me> {
  return readJson<Me>(await api.me.$patch({ json: body }));
}

export async function completeOnboarding(): Promise<Me> {
  return readJson<Me>(await api.me.onboarding.complete.$post());
}

export { ApiRequestError };
