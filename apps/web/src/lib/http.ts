import type { ApiError } from "@miu/shared";

/** Erro da API já no formato padrão `{ erro, mensagem, detalhes }`. */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiError,
  ) {
    super(body.mensagem);
  }
}

export async function readJson<T>(res: Response): Promise<T> {
  if (res.ok) return (await res.json()) as T;
  let body: ApiError;
  try {
    body = (await res.json()) as ApiError;
  } catch {
    body = { erro: "erro_rede", mensagem: "Não foi possível falar com o servidor. Tente de novo." };
  }
  throw new ApiRequestError(res.status, body);
}
