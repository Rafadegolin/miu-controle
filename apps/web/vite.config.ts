import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    // precisa vir antes do plugin do React
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "script-defer",
      includeAssets: ["favicon.svg", "theme.js", "icons/apple-touch-icon.png"],
      manifest: {
        name: "Miu Controle",
        short_name: "Miu",
        description: "Controle financeiro pessoal: contas, cartões, recorrências, orçamentos e metas.",
        lang: "pt-BR",
        start_url: "/inicio?origem=app",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#f4f6f5",
        theme_color: "#f4f6f5",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
        shortcuts: [
          { name: "Lançamentos", short_name: "Lançamentos", url: "/lancamentos" },
          { name: "Cartões", short_name: "Cartões", url: "/cartoes" },
        ],
      },
      workbox: {
        // Só o "casco" do app fica offline. Dados (/api) sempre vêm da rede: nada de saldo velho em cache.
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.origin === "https://fonts.googleapis.com" || url.origin === "https://fonts.gstatic.com",
            handler: "CacheFirst",
            options: {
              cacheName: "fontes",
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    }),
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
