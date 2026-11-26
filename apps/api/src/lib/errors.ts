import type { ApiError } from "@miu/shared";
import type { ErrorHandler, NotFoundHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ZodError, z } from "zod";
import type { App } from "../env";

/** Erro esperado, com status e código legível pelo frontend. */
export class HttpError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const onError: ErrorHandler<App> = (err, c) => {
  if (err instanceof HttpError) {
    return c.json<ApiError>({ erro: err.code, mensagem: err.message }, err.status);
  }
  if (err instanceof ZodError) {
    return c.json<ApiError>(
      {
        erro: "dados_invalidos",
        mensagem: "Confira os campos destacados.",
        detalhes: z.flattenError(err).fieldErrors as ApiError["detalhes"],
      },
      400,
    );
  }
  // Erros do próprio Hono (ex.: CSRF recusado → 403) mantêm o status.
  if (err instanceof HTTPException) {
    const status = err.status as ContentfulStatusCode;
    return c.json<ApiError>(
      {
        erro: status === 403 ? "acesso_negado" : "requisicao_invalida",
        mensagem: "Não foi possível atender esse pedido.",
      },
      status,
    );
  }
  console.error("erro_inesperado", { path: c.req.path, err });
  return c.json<ApiError>({ erro: "erro_interno", mensagem: "Algo deu errado. Tente de novo." }, 500);
};

export const notFound: NotFoundHandler<App> = (c) =>
  c.json<ApiError>({ erro: "nao_encontrado", mensagem: "Rota não encontrada." }, 404);
