import type { AppType } from "@miu/api/client";
import { hc } from "hono/client";

/** Cliente RPC tipado: mesma origem, cookies de sessão vão automaticamente. */
export const api = hc<AppType>("/", {
  init: { credentials: "same-origin" },
}).api;
