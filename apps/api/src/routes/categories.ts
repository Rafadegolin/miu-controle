import { and, asc, eq, schema } from "@miu/db";
import { type Category, type CategoryIcon, createCategorySchema, updateCategorySchema } from "@miu/shared";
import { Hono } from "hono";
import type { App } from "../env";
import { HttpError } from "../lib/errors";
import { ownedCategory } from "../lib/user-data";
import { valid } from "../lib/validate";
import { requireUser } from "../middleware/auth";

const { categories } = schema;

const toDto = (c: typeof categories.$inferSelect): Category => ({
  id: c.id,
  name: c.name,
  kind: c.kind,
  color: c.color,
  icon: c.icon as CategoryIcon,
  archived: c.archivedAt !== null,
});

export const categoriesRoutes = new Hono<App>()
  .use(requireUser)
  .get("/", async (c) => {
    const rows = await c.var
      .db()
      .select()
      .from(categories)
      .where(eq(categories.userId, c.var.user.id))
      .orderBy(asc(categories.kind), asc(categories.sortOrder), asc(categories.name));
    return c.json(rows.map(toDto));
  })
  .post("/", valid("json", createCategorySchema), async (c) => {
    const [row] = await c.var
      .db()
      .insert(categories)
      .values({ id: crypto.randomUUID(), userId: c.var.user.id, sortOrder: 1000, ...c.req.valid("json") })
      .returning();
    if (!row) throw new Error("insert categories");
    return c.json(toDto(row), 201);
  })
  .patch("/:id", valid("json", updateCategorySchema), async (c) => {
    const db = c.var.db();
    await ownedCategory(db, c.var.user.id, c.req.param("id"));
    const [row] = await db
      .update(categories)
      .set(c.req.valid("json"))
      .where(and(eq(categories.id, c.req.param("id")), eq(categories.userId, c.var.user.id)))
      .returning();
    if (!row) throw new HttpError(404, "categoria_nao_encontrada", "Categoria não encontrada.");
    return c.json(toDto(row));
  })
  /** Arquiva: some das listas de escolha, mas os lançamentos antigos continuam com ela. */
  .post("/:id/archive", async (c) => {
    const db = c.var.db();
    await ownedCategory(db, c.var.user.id, c.req.param("id"));
    const [row] = await db
      .update(categories)
      .set({ archivedAt: new Date() })
      .where(and(eq(categories.id, c.req.param("id")), eq(categories.userId, c.var.user.id)))
      .returning();
    if (!row) throw new HttpError(404, "categoria_nao_encontrada", "Categoria não encontrada.");
    return c.json(toDto(row));
  })
  .post("/:id/unarchive", async (c) => {
    const db = c.var.db();
    await ownedCategory(db, c.var.user.id, c.req.param("id"));
    const [row] = await db
      .update(categories)
      .set({ archivedAt: null })
      .where(and(eq(categories.id, c.req.param("id")), eq(categories.userId, c.var.user.id)))
      .returning();
    if (!row) throw new HttpError(404, "categoria_nao_encontrada", "Categoria não encontrada.");
    return c.json(toDto(row));
  });
