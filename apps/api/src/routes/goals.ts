import { addMonths, monthlyToReach } from "@miu/core";
import { and, asc, type Db, desc, eq, inArray, or, schema, sql } from "@miu/db";
import {
  boxMoveSchema,
  contributionSchema,
  convertGoalSchema,
  createGoalSchema,
  type Goal,
  type GoalContribution,
  updateGoalSchema,
} from "@miu/shared";
import { Hono } from "hono";
import type { App } from "../env";
import { HttpError } from "../lib/errors";
import { accountBalances, ownedAccount, userToday } from "../lib/user-data";
import { valid } from "../lib/validate";
import { accruedThisMonth, ensureFreshCdi, latestCdiAnnual } from "../lib/yields";
import { requireUser } from "../middleware/auth";

const { goals, goalContributions, accounts, transactions } = schema;
type Row = typeof goals.$inferSelect;

/** Tipos de conta que servem de caixinha. */
const BOX_KINDS = new Set(["savings", "investment"]);

async function ownedGoal(db: Db, userId: string, id: string) {
  const [row] = await db
    .select()
    .from(goals)
    .where(and(eq(goals.id, id), eq(goals.userId, userId)));
  if (!row) throw new HttpError(404, "meta_nao_encontrada", "Meta não encontrada.");
  return row;
}

/**
 * Metas do usuário. Meta com caixinha: o guardado é o saldo da conta-caixinha (aportes são
 * transferências, rendimento entra como receita). Meta sem caixinha: soma dos aportes, como antes.
 */
export async function loadGoals(db: Db, userId: string, today: string, onlyId?: string): Promise<Goal[]> {
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

  // Caixinhas: saldo, nome, % do CDI, rendimento do mês e o quanto entrou nos últimos 3 meses.
  const boxIds = rows.map((g) => g.accountId).filter((x): x is string => Boolean(x));
  const boxInfo = new Map<
    string,
    { name: string; cdiPercent: number | null; balance: number; recent: number }
  >();
  let yields = new Map<string, number>();
  let cdiAnnual: number | null = null;
  if (boxIds.length) {
    const [boxRows, balances, moves, annual] = await Promise.all([
      db
        .select()
        .from(accounts)
        .where(and(eq(accounts.userId, userId), inArray(accounts.id, boxIds))),
      accountBalances(db, userId),
      db
        .select({
          from: transactions.accountId,
          to: transactions.toAccountId,
          amount: transactions.amountCents,
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, userId),
            eq(transactions.kind, "transfer"),
            eq(transactions.status, "posted"),
            sql`${transactions.date} > ${since}`,
            or(inArray(transactions.accountId, boxIds), inArray(transactions.toAccountId, boxIds)),
          ),
        ),
      latestCdiAnnual(db),
    ]);
    cdiAnnual = annual;
    for (const a of boxRows) {
      const net = moves.reduce((s, m) => s + (m.to === a.id ? m.amount : m.from === a.id ? -m.amount : 0), 0);
      boxInfo.set(a.id, {
        name: a.name,
        cdiPercent: a.cdiPercent,
        balance: a.initialBalanceCents + (balances.get(a.id) ?? 0),
        recent: net,
      });
    }
    yields = await accruedThisMonth(
      db,
      boxRows
        .filter((a) => a.cdiPercent !== null)
        .map((a) => ({
          id: a.id,
          userId,
          initialBalanceCents: a.initialBalanceCents,
          cdiPercent: a.cdiPercent as number,
        })),
      today,
    );
  }

  return rows.map((g: Row) => {
    const box = g.accountId ? boxInfo.get(g.accountId) : undefined;
    const savedCents = box ? box.balance : Number(byGoal.get(g.id)?.saved ?? 0);
    const recent = box ? box.recent : Number(byGoal.get(g.id)?.recent ?? 0);
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
      recentMonthlyCents: Math.round(recent / 3),
      box:
        box && g.accountId
          ? {
              accountId: g.accountId,
              accountName: box.name,
              cdiPercent: box.cdiPercent,
              monthYieldCents: yields.get(g.accountId) ?? 0,
              cdiAnnualPercent: box.cdiPercent !== null ? cdiAnnual : null,
            }
          : null,
    };
  });
}

async function one(db: Db, userId: string, id: string) {
  const [goal] = await loadGoals(db, userId, await userToday(db, userId), id);
  if (!goal) throw new HttpError(404, "meta_nao_encontrada", "Meta não encontrada.");
  return goal;
}

/** Cria a conta-caixinha de uma meta (poupança com o nome e a cor da meta). */
async function createBox(
  db: Db,
  userId: string,
  g: { name: string; color: string },
  initialBalanceCents: number,
  cdiPercent: number | null,
) {
  const [{ n } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(accounts)
    .where(eq(accounts.userId, userId));
  const id = crypto.randomUUID();
  await db.insert(accounts).values({
    id,
    userId,
    name: `Caixinha ${g.name}`.slice(0, 60),
    kind: "savings",
    color: g.color,
    initialBalanceCents,
    cdiPercent,
    sortOrder: n,
  });
  return id;
}

export const goalsRoutes = new Hono<App>()
  .use(requireUser)
  .get("/", async (c) => {
    const db = c.var.db();
    const userId = c.var.user.id;
    const today = await userToday(db, userId);
    // Em produção, se o CDI guardado estiver velho (a rotina diária ainda não rodou), busca agora.
    if (c.env.APP_ENV === "production") await ensureFreshCdi(db, (url) => fetch(url), today);
    return c.json(await loadGoals(db, userId, today));
  })
  .post("/", valid("json", createGoalSchema), async (c) => {
    const { initialCents, box, accountId, ...body } = c.req.valid("json");
    const db = c.var.db();
    const userId = c.var.user.id;
    let boxId: string | null = null;
    if (accountId) {
      const acc = await ownedAccount(db, userId, accountId, { activeOnly: true });
      if (!BOX_KINDS.has(acc.kind)) {
        throw new HttpError(400, "dados_invalidos", "A caixinha precisa ser uma poupança ou investimento.");
      }
      boxId = acc.id;
    } else if (box) {
      // O que já está guardado vira o saldo inicial da caixinha (o dinheiro já existe lá).
      boxId = await createBox(
        db,
        userId,
        { name: body.name, color: body.color ?? "#1fbf8f" },
        initialCents ?? 0,
        box.cdiPercent,
      );
    }
    const id = crypto.randomUUID();
    await db
      .insert(goals)
      .values({ id, userId, ...body, targetDate: body.targetDate ?? null, accountId: boxId });
    if (initialCents && !boxId) {
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
  /** Exclui a meta. A caixinha (conta) continua em Contas: o dinheiro dela existe. */
  .delete("/:id", async (c) => {
    const db = c.var.db();
    const g = await ownedGoal(db, c.var.user.id, c.req.param("id"));
    await db.delete(goals).where(eq(goals.id, g.id));
    return c.body(null, 204);
  })
  /** Histórico: aportes (meta simples) ou movimentos da caixinha (guardar, resgatar, rendimento). */
  .get("/:id/contributions", async (c) => {
    const db = c.var.db();
    const userId = c.var.user.id;
    const g = await ownedGoal(db, userId, c.req.param("id"));
    if (g.accountId) {
      const box = g.accountId;
      const rows = await db
        .select()
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, userId),
            or(eq(transactions.accountId, box), eq(transactions.toAccountId, box)),
          ),
        )
        .orderBy(desc(transactions.date), desc(transactions.createdAt))
        .limit(200);
      return c.json(
        rows.map(
          (r): GoalContribution => ({
            id: r.id,
            amountCents:
              r.kind === "income" || (r.kind === "transfer" && r.toAccountId === box)
                ? r.amountCents
                : -r.amountCents,
            date: r.date,
            note: r.description,
            fromBox: true,
          }),
        ),
      );
    }
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
  /** Aporte (positivo) ou retirada (negativo) em meta simples. Não dá para retirar mais do que tem. */
  .post("/:id/contributions", valid("json", contributionSchema), async (c) => {
    const body = c.req.valid("json");
    const db = c.var.db();
    const userId = c.var.user.id;
    const g = await ownedGoal(db, userId, c.req.param("id"));
    if (g.accountId) {
      throw new HttpError(400, "meta_caixinha", "Esta meta é uma caixinha: use Guardar ou Resgatar.");
    }
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
    if (g.accountId) {
      throw new HttpError(400, "meta_caixinha", "Movimentos da caixinha se editam em Lançamentos.");
    }
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
  })
  /** Caixinha: guardar (sai da conta escolhida) ou resgatar (volta para ela) = transferência. */
  .post("/:id/move", valid("json", boxMoveSchema), async (c) => {
    const body = c.req.valid("json");
    const db = c.var.db();
    const userId = c.var.user.id;
    const g = await ownedGoal(db, userId, c.req.param("id"));
    if (!g.accountId) {
      throw new HttpError(400, "meta_sem_caixinha", "Esta meta não tem caixinha: use Aportar ou Retirar.");
    }
    const [other, today] = await Promise.all([
      ownedAccount(db, userId, body.accountId, { activeOnly: true }),
      userToday(db, userId),
    ]);
    if (other.kind === "credit_card" || other.id === g.accountId) {
      throw new HttpError(400, "dados_invalidos", "Escolha uma conta (não cartão) diferente da caixinha.");
    }
    if (body.direction === "out") {
      const [current] = await loadGoals(db, userId, today, g.id);
      if ((current?.savedCents ?? 0) < body.amountCents) {
        throw new HttpError(
          400,
          "resgate_maior_que_saldo",
          "Não dá para resgatar mais do que tem na caixinha.",
        );
      }
    }
    const into = body.direction === "in";
    await db.insert(transactions).values({
      id: crypto.randomUUID(),
      userId,
      kind: "transfer",
      accountId: into ? other.id : g.accountId,
      toAccountId: into ? g.accountId : other.id,
      amountCents: body.amountCents,
      categoryId: null,
      date: body.date,
      description: into ? `Guardar · ${g.name}` : `Resgate · ${g.name}`,
      status: body.date > today ? "planned" : "posted",
      source: "manual",
    });
    return c.json(await one(db, userId, g.id), 201);
  })
  /** Meta simples → caixinha: cria a conta com o que já foi guardado (os aportes viram histórico). */
  .post("/:id/convert", valid("json", convertGoalSchema), async (c) => {
    const { cdiPercent } = c.req.valid("json");
    const db = c.var.db();
    const userId = c.var.user.id;
    const g = await ownedGoal(db, userId, c.req.param("id"));
    if (g.accountId) throw new HttpError(400, "meta_caixinha", "Esta meta já é uma caixinha.");
    const [current] = await loadGoals(db, userId, await userToday(db, userId), g.id);
    const boxId = await createBox(db, userId, g, Math.max(0, current?.savedCents ?? 0), cdiPercent);
    await db.update(goals).set({ accountId: boxId }).where(eq(goals.id, g.id));
    return c.json(await one(db, userId, g.id));
  });
