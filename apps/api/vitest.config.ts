import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Cada teste sobe um Postgres em memória e faz hash de senha (PBKDF2): sob CPU disputada
    // (turbo rodando tudo em paralelo) o padrão de 5 s é curto.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
