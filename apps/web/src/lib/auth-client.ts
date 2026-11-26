import { createAuthClient } from "better-auth/react";

/** Cliente do Better Auth. Mesma origem: a sessão vive num cookie httpOnly. */
export const authClient = createAuthClient({
  baseURL: typeof window === "undefined" ? "http://localhost" : window.location.origin,
  basePath: "/api/auth",
});

const MESSAGES: Record<string, string> = {
  USER_ALREADY_EXISTS: "Já existe uma conta com este e-mail. Tente entrar.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "Já existe uma conta com este e-mail. Tente entrar.",
  INVALID_EMAIL_OR_PASSWORD: "E-mail ou senha incorretos.",
  INVALID_EMAIL: "Digite um e-mail válido, como voce@exemplo.com.",
  INVALID_PASSWORD: "Senha incorreta.",
  EMAIL_NOT_VERIFIED: "Confirme seu e-mail antes de entrar. Reenviamos o link para você.",
  PASSWORD_TOO_SHORT: "A senha precisa ter pelo menos 10 caracteres.",
  PASSWORD_TOO_LONG: "A senha pode ter no máximo 128 caracteres.",
  INVALID_TOKEN: "Este link expirou ou já foi usado. Peça um novo.",
  MISSING_RESPONSE: "Confirme a verificação anti-robô e tente de novo.",
  VERIFICATION_FAILED: "A verificação anti-robô falhou. Recarregue a página e tente de novo.",
  muitas_tentativas: "Muitas tentativas seguidas. Espere um minuto e tente de novo.",
};

/** Traduz o erro do Better Auth (ou da nossa API) para uma frase que o usuário entende. */
export function authErrorMessage(
  error: { code?: string; status?: number; message?: string } | null | undefined,
): string | null {
  if (!error) return null;
  const fallback = "Não foi possível concluir agora. Verifique sua conexão e tente de novo.";
  if (error.status === 429) return MESSAGES.muitas_tentativas ?? fallback;
  return (error.code && MESSAGES[error.code]) || fallback;
}
