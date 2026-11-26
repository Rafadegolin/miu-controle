import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Db } from "./index";
import * as schema from "./schema/index";

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), "../migrations");

/**
 * Postgres de verdade (PGlite, em memória) com todas as migrations aplicadas.
 * Usado nos testes da API: mesmo SQL de produção, sem depender do Neon.
 */
export async function createTestDb(): Promise<{ db: Db; close: () => Promise<void> }> {
  const client = new PGlite();
  const db = drizzle(client, { schema, casing: "snake_case" });
  await migrate(db, { migrationsFolder });
  return { db: db as unknown as Db, close: () => client.close() };
}
