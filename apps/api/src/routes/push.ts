import { and, desc, eq, schema } from "@miu/db";
import {
  type PushConfig,
  type PushDevice,
  type PushTestResult,
  pushEndpointSchema,
  subscribePushSchema,
} from "@miu/shared";
import { Hono } from "hono";
import type { App } from "../env";
import { HttpError } from "../lib/errors";
import { sendToUser } from "../lib/push";
import { valid } from "../lib/validate";
import { requireUser } from "../middleware/auth";

const { pushSubscriptions } = schema;

export const pushRoutes = new Hono<App>()
  .use(requireUser)
  /** Chave pública para o navegador se inscrever (null = push desligado no servidor). */
  .get("/config", (c) => {
    const body: PushConfig = { publicKey: c.var.push() ? (c.env.VAPID_PUBLIC_KEY ?? null) : null };
    return c.json(body);
  })
  .get("/subscriptions", async (c) => {
    const rows = await c.var
      .db()
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, c.var.user.id))
      .orderBy(desc(pushSubscriptions.createdAt));
    return c.json(
      rows.map(
        (r): PushDevice => ({
          id: r.id,
          device: r.device,
          createdAt: r.createdAt.toISOString(),
          lastSuccessAt: r.lastSuccessAt?.toISOString() ?? null,
        }),
      ),
    );
  })
  /** Ativa (ou renova) o aparelho. O mesmo aparelho em outra conta passa a ser desta. */
  .post("/subscriptions", valid("json", subscribePushSchema), async (c) => {
    const body = c.req.valid("json");
    const userId = c.var.user.id;
    await c.var
      .db()
      .insert(pushSubscriptions)
      .values({
        id: crypto.randomUUID(),
        userId,
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        device: body.device ?? null,
      })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: { userId, p256dh: body.keys.p256dh, auth: body.keys.auth, device: body.device ?? null },
      });
    return c.json({ ok: true }, 201);
  })
  /** Desativa o aparelho (só os do próprio usuário). */
  .delete("/subscriptions", valid("json", pushEndpointSchema), async (c) => {
    await c.var
      .db()
      .delete(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.userId, c.var.user.id),
          eq(pushSubscriptions.endpoint, c.req.valid("json").endpoint),
        ),
      );
    return c.body(null, 204);
  })
  /** Notificação de teste para este aparelho. */
  .post("/test", valid("json", pushEndpointSchema), async (c) => {
    const send = c.var.push();
    if (!send)
      throw new HttpError(503, "push_desligado", "As notificações ainda não estão configuradas no servidor.");
    const r = await sendToUser(
      c.var.db(),
      send,
      c.var.user.id,
      {
        title: "Tudo certo! 🐱",
        body: "As notificações do Miu estão funcionando neste aparelho.",
        url: "/configuracoes",
        tag: "teste",
      },
      c.req.valid("json").endpoint,
    );
    if (r.devices === 0) {
      throw new HttpError(
        404,
        "aparelho_nao_encontrado",
        "Este aparelho não está com as notificações ativadas.",
      );
    }
    if (r.sent === 0) {
      throw new HttpError(
        502,
        "push_recusado",
        `O serviço de notificações do aparelho recusou o envio. Desative e ative de novo neste aparelho. (Detalhe técnico: ${r.reasons.join("; ") || "sem resposta"})`,
      );
    }
    const body: PushTestResult = { sent: r.sent, failed: r.failed };
    return c.json(body);
  });
