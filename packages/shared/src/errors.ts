/** Formato único de erro de toda a API. */
export type ApiError = {
  erro: string;
  mensagem: string;
  detalhes?: Record<string, string[] | undefined>;
};
