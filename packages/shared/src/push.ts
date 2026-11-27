import { z } from "zod";

/** Chave em base64url (sem "="). */
const b64url = (min: number, max: number) =>
  z
    .string()
    .min(min)
    .max(max)
    .regex(/^[A-Za-z0-9_-]+$/, "Chave inválida.");

const endpoint = z
  .string()
  .url()
  .max(2048)
  .refine((u) => u.startsWith("https://"), "O endereço de push precisa ser https.");

/** Inscrição que o navegador devolve em `pushManager.subscribe()` (`subscription.toJSON()`). */
export const subscribePushSchema = z
  .object({
    endpoint,
    keys: z.object({ p256dh: b64url(80, 100), auth: b64url(16, 32) }).strict(),
    /** Rótulo do aparelho, ex.: "iPhone · Safari". */
    device: z.string().trim().max(120).optional(),
  })
  .strict();
export type SubscribePush = z.infer<typeof subscribePushSchema>;

export const pushEndpointSchema = z.object({ endpoint }).strict();

export type PushConfig = {
  /** Chave pública VAPID (base64url); null = push não configurado no servidor. */
  publicKey: string | null;
};

export type PushDevice = {
  id: string;
  device: string | null;
  createdAt: string;
  lastSuccessAt: string | null;
};

export type PushTestResult = { sent: number; failed: number };
