import { eq, schema } from "@miu/db";
import { type Me, updateMeSchema } from "@miu/shared";
import { Hono } from "hono";
import type { App, SessionUser } from "../env";
import { getSettings } from "../lib/user-data";
import { valid } from "../lib/validate";
import { requireUser } from "../middleware/auth";

const { user, userSettings } = schema;

function toMe(u: SessionUser, s: Awaited<ReturnType<typeof getSettings>>): Me {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    emailVerified: u.emailVerified,
    settings: {
      timezone: s.timezone,
      currency: s.currency,
      monthlyIncomeCents: s.monthlyIncomeCents,
      onboardingCompleted: s.onboardingCompletedAt !== null,
      emailAlerts: s.emailAlerts,
      monthlySpendingLimitCents: s.monthlySpendingLimitCents,
    },
  };
}

export const me = new Hono<App>()
  .use(requireUser)
  .get("/", async (c) => {
    const s = await getSettings(c.var.db(), c.var.user.id);
    return c.json(toMe(c.var.user, s));
  })
  .patch("/", valid("json", updateMeSchema), async (c) => {
    const body = c.req.valid("json");
    const db = c.var.db();
    const u = { ...c.var.user };
    await getSettings(db, u.id);

    if (body.name !== undefined) {
      await db.update(user).set({ name: body.name }).where(eq(user.id, u.id));
      u.name = body.name;
    }
    const patch: Partial<typeof userSettings.$inferInsert> = {};
    if (body.monthlyIncomeCents !== undefined) patch.monthlyIncomeCents = body.monthlyIncomeCents;
    if (body.timezone !== undefined) patch.timezone = body.timezone;
    if (body.emailAlerts !== undefined) patch.emailAlerts = body.emailAlerts;
    if (body.monthlySpendingLimitCents !== undefined)
      patch.monthlySpendingLimitCents = body.monthlySpendingLimitCents;
    if (Object.keys(patch).length)
      await db.update(userSettings).set(patch).where(eq(userSettings.userId, u.id));

    return c.json(toMe(u, await getSettings(db, u.id)));
  })
  .post("/onboarding/complete", async (c) => {
    const db = c.var.db();
    await getSettings(db, c.var.user.id);
    const [s] = await db
      .update(userSettings)
      .set({ onboardingCompletedAt: new Date() })
      .where(eq(userSettings.userId, c.var.user.id))
      .returning();
    if (!s) throw new Error("user_settings sumiu");
    return c.json(toMe(c.var.user, s));
  });
