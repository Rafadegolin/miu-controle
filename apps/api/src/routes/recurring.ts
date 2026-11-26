import { addDays, monthlyEquivalent, nextOccurrence } from "@miu/core";
import { and, asc, type Db, eq, gte, schema } from "@miu/db";
import { createRecurringSchema, type RecurringRule, updateRecurringSchema } from "@miu/shared";
import { Hono } from "hono";
import { z } from "zod";
import type { App } from "../env";
import { HttpError } from "../lib/errors";
import { generateOccurrences, regenerateRule } from "../lib/recurring";
import { ownedAccount, ownedCategory, userToday } from "../lib/user-data";
import { valid } from "../lib/validate";
import { requireUser } from "../middleware/auth";

const { recurringRules, transactions } = schema;
type Row = typeof recurringRules.$inferSelect;

function toDto(r: Row, today: string): RecurringRule {
  return {
    id: r.id,
    kind: r.kind,
    amountCents: r.amountCents,
    monthlyCents: monthlyEquivalent(r.amountCents, r.frequency, r.interval),
    accountId: r.accountId,
    toAccountId: r.toAccountId,
    categoryId: r.categoryId,
    description: r.description,
    frequency: r.frequency,
    interval: r.interval,
    dayOfMonth: r.dayOfMonth,
    startDate: r.startDate,
    endDate: r.endDate,
    autoPost: r.autoPost,
    paused: r.pausedAt !== null,
    nextDate: r.pausedAt
      ? null
      : nextOccurrence(
          {
            frequency: r.frequency,
            interval: r.interval,
            startDate: r.startDate,
            endDate: r.endDate,
            dayOfMonth: r.dayOfMonth,
          },
          today,
        ),
  };
}

async function ownedRule(db: Db, userId: string, id: string) {
  const [row] = await db
    .select()
    .from(recurringRules)
    .where(and(eq(recurringRules.id, id), eq(recurringRules.userId, userId)));
  if (!row) throw new HttpError(404, "recorrencia_nao_encontrada", "Recorrência não encontrada.");
  return row;
}

/** Mesmas regras de um lançamento: contas e categoria do usuário, tipos compatíveis, nada saindo do cartão. */
async function checkRefs(
  db: Db,
  userId: string,
  r: { kind: Row["kind"]; accountId: string; toAccountId?: string | null; categoryId?: string | null },
) {
  const [account] = await Promise.all([
    ownedAccount(db, userId, r.accountId, { activeOnly: true }),
    r.kind === "transfer" && r.toAccountId
      ? ownedAccount(db, userId, r.toAccountId, { activeOnly: true })
      : null,
    r.kind !== "transfer" && r.categoryId
      ? ownedCategory(db, userId, r.categoryId).then((c) => {
          if (c.kind !== r.kind) {
            throw new HttpError(
              400,
              "categoria_incompativel",
              "Essa categoria é de outro tipo de lançamento.",
            );
          }
        })
      : null,
  ]);
  if (r.kind === "transfer") {
    if (!r.toAccountId || r.toAccountId === r.accountId) {
      throw new HttpError(400, "dados_invalidos", "Escolha contas diferentes.");
    }
    if (account.kind === "credit_card") {
      throw new HttpError(400, "transferencia_do_cartao", "Transferência sai de uma conta, não do cartão.");
    }
  }
}

export const recurringRoutes = new Hono<App>()
  .use(requireUser)
  .get("/", async (c) => {
    const db = c.var.db();
    const userId = c.var.user.id;
    const [rows, today] = await Promise.all([
      db
        .select()
        .from(recurringRules)
        .where(eq(recurringRules.userId, userId))
        .orderBy(asc(recurringRules.kind), asc(recurringRules.description)),
      userToday(db, userId),
    ]);
    return c.json(rows.map((r) => toDto(r, today)));
  })
  .post(
    "/",
    valid(
      "json",
      z.intersection(
        createRecurringSchema,
        // Lançamento rápido com "repetir": a primeira ocorrência já aconteceu.
        z.object({ firstPosted: z.boolean().optional() }),
      ),
    ),
    async (c) => {
      const { firstPosted, ...body } = c.req.valid("json");
      const db = c.var.db();
      const userId = c.var.user.id;
      const [today] = await Promise.all([userToday(db, userId), checkRefs(db, userId, body)]);
      const [row] = await db
        .insert(recurringRules)
        .values({
          id: crypto.randomUUID(),
          userId,
          kind: body.kind,
          amountCents: body.amountCents,
          accountId: body.accountId,
          toAccountId: body.kind === "transfer" ? body.toAccountId : null,
          categoryId: body.kind === "transfer" ? null : body.categoryId,
          description: body.description,
          frequency: body.frequency,
          interval: body.interval,
          dayOfMonth: body.dayOfMonth ?? null,
          startDate: body.startDate,
          endDate: body.endDate ?? null,
          autoPost: body.autoPost,
          // Regra nova só gera de hoje em diante. O saldo da conta foi informado "como está hoje",
          // então meses passados já estão nele; gerá-los descontaria duas vezes.
          generatedUntil: body.startDate < today ? addDays(today, -1) : null,
        })
        .returning();
      if (!row) throw new Error("insert recurring_rules");
      await generateOccurrences(db, [row], () => today);
      if (firstPosted && body.startDate <= today) {
        await db
          .update(transactions)
          .set({ status: "posted" })
          .where(and(eq(transactions.recurringRuleId, row.id), eq(transactions.date, body.startDate)));
      }
      return c.json(toDto(row, today), 201);
    },
  )
  .patch("/:id", valid("json", updateRecurringSchema), async (c) => {
    const patch = c.req.valid("json");
    const db = c.var.db();
    const userId = c.var.user.id;
    const current = await ownedRule(db, userId, c.req.param("id"));
    if (current.kind === "transfer" && patch.categoryId !== undefined) {
      throw new HttpError(400, "dados_invalidos", "Transferência não tem categoria.");
    }
    if (current.kind !== "transfer" && patch.toAccountId !== undefined) {
      throw new HttpError(400, "dados_invalidos", "Só transferências têm conta de destino.");
    }
    const next = { ...current, ...patch };
    if (next.endDate && next.endDate < next.startDate) {
      throw new HttpError(400, "dados_invalidos", "A data final precisa ser depois do início.");
    }
    const [today] = await Promise.all([
      userToday(db, userId),
      patch.accountId || patch.toAccountId || patch.categoryId ? checkRefs(db, userId, next) : null,
    ]);
    const [row] = await db
      .update(recurringRules)
      .set(patch)
      .where(and(eq(recurringRules.id, current.id), eq(recurringRules.userId, userId)))
      .returning();
    if (!row) throw new HttpError(404, "recorrencia_nao_encontrada", "Recorrência não encontrada.");
    // Mudanças valem daqui para frente: previsões futuras são refeitas; o histórico fica como está.
    if (!row.pausedAt) await regenerateRule(db, row, today);
    return c.json(toDto(row, today));
  })
  /** Pausar: some com as previsões futuras e para de gerar. */
  .post("/:id/pause", async (c) => {
    const db = c.var.db();
    const userId = c.var.user.id;
    const current = await ownedRule(db, userId, c.req.param("id"));
    const today = await userToday(db, userId);
    const [row] = await db
      .update(recurringRules)
      .set({ pausedAt: new Date() })
      .where(eq(recurringRules.id, current.id))
      .returning();
    await db
      .delete(transactions)
      .where(
        and(
          eq(transactions.recurringRuleId, current.id),
          eq(transactions.status, "planned"),
          gte(transactions.date, today),
        ),
      );
    if (!row) throw new HttpError(404, "recorrencia_nao_encontrada", "Recorrência não encontrada.");
    return c.json(toDto(row, today));
  })
  .post("/:id/resume", async (c) => {
    const db = c.var.db();
    const userId = c.var.user.id;
    const current = await ownedRule(db, userId, c.req.param("id"));
    const today = await userToday(db, userId);
    const [row] = await db
      .update(recurringRules)
      .set({ pausedAt: null })
      .where(eq(recurringRules.id, current.id))
      .returning();
    if (!row) throw new HttpError(404, "recorrencia_nao_encontrada", "Recorrência não encontrada.");
    // Retoma de hoje em diante: o período pausado não é cobrado de volta.
    await regenerateRule(db, row, today);
    return c.json(toDto(row, today));
  })
  /** Exclui a regra e as previsões futuras. O que já aconteceu continua nos lançamentos. */
  .delete("/:id", async (c) => {
    const db = c.var.db();
    const userId = c.var.user.id;
    const current = await ownedRule(db, userId, c.req.param("id"));
    const today = await userToday(db, userId);
    await db
      .delete(transactions)
      .where(
        and(
          eq(transactions.recurringRuleId, current.id),
          eq(transactions.status, "planned"),
          gte(transactions.date, today),
        ),
      );
    await db.delete(recurringRules).where(eq(recurringRules.id, current.id));
    return c.body(null, 204);
  });
