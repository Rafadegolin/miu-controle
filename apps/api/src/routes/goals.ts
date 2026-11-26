import { addMonths, monthlyToReach } from "@miu/core";
import { and, asc, type Db, desc, eq, schema, sql } from "@miu/db";
import {
  contributionSchema,
  createGoalSchema,
  type Goal,
  type GoalContribution,
  updateGoalSchema,
} from "@miu/shared";
import { Hono } from "hono";
import type { App } from "../env";
import { HttpError } from "../lib/errors";
import { userToday } from "../lib/user-data";
import { valid } from "../lib/validate";
import { requireUser } from "../middleware/auth";

const { goals, goalContributions } = schema;
type Row = typeof goals.$inferSelect;

async function ownedGoal(db: Db, userId: string, id: string) {
  const [row] = await db
    .select()
    .from(goals)
    .where(and(eq(goals.id, id), eq(goals.userId, userId)));
  if (!row) throw new HttpError(404, "meta_nao_encontrada", "Meta não encontrada.");
  return row;
}

/** Metas do usuário com o guardado (soma dos aportes) e o ritmo recente. */
async function loadGoals(db: Db, userId: string, today: string, onlyId?: string): Promise<Goal[]> {
  const since = addMonths(today, -3);
  const [rows, sums] = await Promise.all([
    db
      .select()
      .from(goals)
      .where(and(eq(goals.userId, userId), onlyId ? eq(goals.id, onlyId) : undefined))
      .orderBy(asc(goals.createdAt)),
    db
      .select({
        goalId: goalContributions.goalId,
        saved: sql<string>`sum(${goalContributions.amountCents})`,
        recent: sql<string>`coalesce(sum(${goalContributions.amountCents}) filter (where ${goalContributions.date} > ${since}), 0)`,
      })
      .from(goalContributions)
      .where(eq(goalContributions.userId, userId))
      .groupBy(goalContributions.goalId),
  ]);
  const byGoal = new Map(sums.map((s) => [s.goalId, s]));
  return rows.map((g: Row) => {
    const savedCents = Number(byGoal.get(g.id)?.saved ?? 0);
    return {
      id: g.id,
      name: g.name,
      targetCents: g.targetCents,
      targetDate: g.targetDate,
      color: g.color,
      archived: g.archivedAt !== null,
      savedCents,
      progress: savedCents / g.targetCents,
      monthlyNeededCents: monthlyToReach({
        targetCents: g.targetCents,
        savedCents,
        today,
        targetDate: g.targetDate,
      }),
      recentMonthlyCents: Math.round(Number(byGoal.get(g.id)?.recent ?? 0) / 3),
    };
  });
}

async function one(db: Db, userId: string, id: string) {
  const [goal] = await loadGoals(db, userId, await userToday(db, userId), id);
  if (!goal) throw new HttpError(404, "meta_nao_encontrada", "Meta não encontrada.");
  return goal;
}

export const goalsRoutes = new Hono<App>()
  .use(requireUser)
  .get("/", async (c) => {
    const db = c.var.db();
    const userId = c.var.user.id;
    return c.json(await loadGoals(db, userId, await userToday(db, userId)));
  })
  .post("/", valid("json", createGoalSchema), async (c) => {
    const { initialCents, ...body } = c.req.valid("json");
    const db = c.var.db();
    const userId = c.var.user.id;
    const id = crypto.randomUUID();
    await db.insert(goals).values({ id, userId, ...body, targetDate: body.targetDate ?? null });
    if (initialCents) {
      await db.insert(goalContributions).values({
        id: crypto.randomUUID(),
        userId,
        goalId: id,
        amountCents: initialCents,
        date: await userToday(db, userId),
        note: "Valor inicial",
      });
    }
    return c.json(await one(db, userId, id), 201);
  })
  .patch("/:id", valid("json", updateGoalSchema), async (c) => {
    const db = c.var.db();
    const userId = c.var.user.id;
    const g = await ownedGoal(db, userId, c.req.param("id"));
    await db.update(goals).set(c.req.valid("json")).where(eq(goals.id, g.id));
    return c.json(await one(db, userId, g.id));
  })
  .post("/:id/archive", async (c) => {
    const db = c.var.db();
    const userId = c.var.user.id;
    const g = await ownedGoal(db, userId, c.req.param("id"));
    await db
      .update(goals)
      .set({ archivedAt: g.archivedAt ? null : new Date() })
      .where(eq(goals.id, g.id));
    return c.json(await one(db, userId, g.id));
  })
  .delete("/:id", async (c) => {
    const db = c.var.db();
    const g = await ownedGoal(db, c.var.user.id, c.req.param("id"));
    await db.delete(goals).where(eq(goals.id, g.id));
    return c.body(null, 204);
  })
  .get("/:id/contributions", async (c) => {
    const db = c.var.db();
    const g = await ownedGoal(db, c.var.user.id, c.req.param("id"));
    const rows = await db
      .select()
      .from(goalContributions)
      .where(eq(goalContributions.goalId, g.id))
      .orderBy(desc(goalContributions.date), desc(goalContributions.createdAt));
    return c.json(
      rows.map(
        (r): GoalContribution => ({ id: r.id, amountCents: r.amountCents, date: r.date, note: r.note }),
      ),
    );
  })
  /** Aporte (positivo) ou retirada (negativo). Não dá para retirar mais do que tem. */
  .post("/:id/contributions", valid("json", contributionSchema), async (c) => {
    const body = c.req.valid("json");
    const db = c.var.db();
    const userId = c.var.user.id;
    const g = await ownedGoal(db, userId, c.req.param("id"));
    if (body.amountCents < 0) {
      const [current] = await loadGoals(db, userId, await userToday(db, userId), g.id);
      if ((current?.savedCents ?? 0) + body.amountCents < 0) {
        throw new HttpError(
          400,
          "retirada_maior_que_saldo",
          "Não dá para retirar mais do que está guardado na meta.",
        );
      }
    }
    await db.insert(goalContributions).values({
      id: crypto.randomUUID(),
      userId,
      goalId: g.id,
      amountCents: body.amountCents,
      date: body.date,
      note: body.note ?? null,
    });
    return c.json(await one(db, userId, g.id), 201);
  })
  .delete("/:id/contributions/:cid", async (c) => {
    const db = c.var.db();
    const userId = c.var.user.id;
    const g = await ownedGoal(db, userId, c.req.param("id"));
    await db
      .delete(goalContributions)
      .where(
        and(
          eq(goalContributions.id, c.req.param("cid")),
          eq(goalContributions.goalId, g.id),
          eq(goalContributions.userId, userId),
        ),
      );
    return c.json(await one(db, userId, g.id));
  });
