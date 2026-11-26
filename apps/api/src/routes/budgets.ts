import { monthToDate } from "@miu/core";
import { schema } from "@miu/db";
import { setBudgetSchema, yearMonth } from "@miu/shared";
import { Hono } from "hono";
import { z } from "zod";
import type { App } from "../env";
import { budgetMonth } from "../lib/budgets";
import { HttpError } from "../lib/errors";
import { ownedCategory } from "../lib/user-data";
import { valid } from "../lib/validate";
import { requireUser } from "../middleware/auth";

const { budgets } = schema;

export const budgetsRoutes = new Hono<App>()
  .use(requireUser)
  .get("/", valid("query", z.object({ month: yearMonth })), async (c) => {
    const { month } = c.req.valid("query");
    return c.json(await budgetMonth(c.var.db(), c.var.user.id, month));
  })
  /** Define (ou remove, com null) o limite da categoria a partir de um mês. */
  .put("/:categoryId", valid("json", setBudgetSchema), async (c) => {
    const { month, amountCents } = c.req.valid("json");
    const db = c.var.db();
    const userId = c.var.user.id;
    const cat = await ownedCategory(db, userId, c.req.param("categoryId"));
    if (cat.kind !== "expense") {
      throw new HttpError(400, "categoria_incompativel", "Orçamento é só para categorias de despesa.");
    }
    const validFrom = monthToDate(month);
    await db
      .insert(budgets)
      .values({ id: crypto.randomUUID(), userId, categoryId: cat.id, validFrom, amountCents })
      .onConflictDoUpdate({
        target: [budgets.userId, budgets.categoryId, budgets.validFrom],
        set: { amountCents, updatedAt: new Date() },
      });
    return c.json({ categoryId: cat.id, month, amountCents });
  });
