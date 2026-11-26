import { defineConfig } from "drizzle-kit";

// `generate` não conecta no banco; `migrate` precisa de DATABASE_URL com a conexão DIRETA do Neon
// (nunca a do Hyperdrive nem a do pooler).
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dbCredentials: { url: process.env.DATABASE_URL ?? "postgres://localhost:5432/miu" },
  casing: "snake_case",
  strict: true,
});
