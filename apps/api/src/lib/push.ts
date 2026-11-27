import { and, type Db, eq, inArray, schema } from "@miu/db";
import type { Bindings } from "../env";
import { type PushMessage, type PushSender, webPushSender } from "./web-push";

const { pushSubscriptions } = schema;

/** Envio de push do ambiente; sem chaves VAPID o recurso fica desligado. */
export function pushSenderFor(env: Bindings): PushSender | null {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return null;
  return webPushSender({
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKeyJwk: env.VAPID_PRIVATE_KEY,
    subject: env.APP_URL.startsWith("https://") ? env.APP_URL : "mailto:contato@miucontrole.com.br",
  });
}

/**
 * Manda uma notificação para os aparelhos do usuário (ou só para um endpoint).
 * Aparelho que cancelou a inscrição (404/410) sai do banco.
 */
export async function sendToUser(
  db: Db,
  send: PushSender,
  userId: string,
  message: PushMessage,
  onlyEndpoint?: string,
): Promise<{ sent: number; failed: number; devices: number; reasons: string[] }> {
  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.userId, userId),
        onlyEndpoint ? eq(pushSubscriptions.endpoint, onlyEndpoint) : undefined,
      ),
    );
  const results = await Promise.all(subs.map((s) => send(s, message).then((r) => ({ s, r }))));
  const gone = results.filter((x) => x.r.gone).map((x) => x.s.id);
  const ok = results.filter((x) => x.r.ok).map((x) => x.s.id);
  if (gone.length) await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, gone));
  if (ok.length) {
    await db
      .update(pushSubscriptions)
      .set({ lastSuccessAt: new Date() })
      .where(inArray(pushSubscriptions.id, ok));
  }
  const reasons = results.filter((x) => !x.r.ok).map((x) => `${x.r.status} ${x.r.reason ?? ""}`.trim());
  return { sent: ok.length, failed: results.length - ok.length, devices: subs.length, reasons };
}
