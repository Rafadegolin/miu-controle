import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index";

/**
 * Tipo comum a qualquer driver Postgres do Drizzle (postgres-js em produção, PGlite nos testes).
 * O código da API depende só deste tipo, nunca do driver.
 */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

/**
 * Cria o cliente por request. No Worker a string vem do Hyperdrive (env.HYPERDRIVE.connectionString),
 * que já mantém o pool; por isso `max` baixo e sem prepared statements.
 */
export function createDb(connectionString: string): { db: Db; close: () => Promise<void> } {
  const sql = postgres(connectionString, {
    max: 5,
    prepare: false,
    fetch_types: false,
    connect_timeout: 10,
  });
  const db = drizzle(sql, { schema, casing: "snake_case" }) as unknown as Db;
  return { db, close: () => sql.end({ timeout: 5 }) };
}

export { and, asc, desc, eq, sql } from "drizzle-orm";
export { schema };
