import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    // precisa vir antes do plugin do React
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    port: 5173,
    // Em dev a API roda no wrangler (porta 8787); em produção é a mesma origem.
    proxy: { "/api": "http://localhost:8787" },
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
