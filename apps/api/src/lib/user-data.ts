import { todayIn } from "@miu/core";
import { and, type Db, eq, isNull, schema, sql } from "@miu/db";
import { DEFAULT_CATEGORIES } from "@miu/shared";
import { HttpError } from "./errors";

const { accounts, categories, transactions, userSettings } = schema;

/** Lê as configurações, criando a linha padrão no primeiro acesso. */
export async function getSettings(db: Db, userId: string) {
  const [row] = await db
    .insert(userSettings)
    .values({ userId })
    .onConflictDoUpdate({ target: userSettings.userId, set: { userId } })
    .returning();
  if (!row) throw new Error("user_settings não retornou linha");
  return row;
}

/** "Hoje" no fuso do usuário. */
export async function userToday(db: Db, userId: string) {
  const [row] = await db
    .select({ tz: userSettings.timezone })
    .from(userSettings)
    .where(eq(userSettings.userId, userId));
  return todayIn(row?.tz ?? "America/Sao_Paulo");
}

/** Cria as categorias padrão de um usuário novo (cópia por usuário, sem categoria "global"). */
export async function seedDefaultCategories(db: Db, userId: string) {
  await db.insert(categories).values(
    DEFAULT_CATEGORIES.map((c, i) => ({
      id: crypto.randomUUID(),
      userId,
      name: c.name,
      kind: c.kind,
      icon: c.icon,
      color: c.color,
      sortOrder: i,
    })),
  );
}

/** Conta do usuário ou 404. Nunca revela se o id existe para outra pessoa. */
export async function ownedAccount(db: Db, userId: string, id: string, { activeOnly = false } = {}) {
  const [row] = await db
    .select()
    .from(accounts)
    .where(
      and(
        eq(accounts.id, id),
        eq(accounts.userId, userId),
        activeOnly ? isNull(accounts.archivedAt) : undefined,
      ),
    );
  if (!row) throw new HttpError(404, "conta_nao_encontrada", "Conta não encontrada.");
  return row;
}

export async function ownedCategory(db: Db, userId: string, id: string) {
  const [row] = await db
    .select()
    .from(categories)
    .where(and(eq(categories.id, id), eq(categories.userId, userId)));
  if (!row) throw new HttpError(404, "categoria_nao_encontrada", "Categoria não encontrada.");
  return row;
}

/**
 * Saldo de cada conta = saldo inicial + receitas − despesas − transferências enviadas
 * + transferências recebidas, contando só o que está realizado ("posted").
 */
export async function accountBalances(db: Db, userId: string): Promise<Map<string, number>> {
  const [own, incoming] = await Promise.all([
    db
      .select({
        accountId: transactions.accountId,
        delta: sql<string>`sum(case when ${transactions.kind} = 'income' then ${transactions.amountCents} else -${transactions.amountCents} end)`,
      })
      .from(transactions)
      .where(and(eq(transactions.userId, userId), eq(transactions.status, "posted")))
      .groupBy(transactions.accountId),
    db
      .select({ accountId: transactions.toAccountId, delta: sql<string>`sum(${transactions.amountCents})` })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.status, "posted"),
          eq(transactions.kind, "transfer"),
        ),
      )
      .groupBy(transactions.toAccountId),
  ]);
  const map = new Map<string, number>();
  for (const r of [...own, ...incoming]) {
    if (!r.accountId) continue;
    map.set(r.accountId, (map.get(r.accountId) ?? 0) + Number(r.delta));
  }
  return map;
}
