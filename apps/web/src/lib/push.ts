import type { PushConfig, PushDevice, PushTestResult } from "@miu/shared";
import { queryOptions } from "@tanstack/react-query";
import { api } from "./api";
import { readJson } from "./http";

/*
 * Notificações push neste aparelho: suporte, permissão e inscrição no navegador, e o registro na API.
 * O estado do navegador também passa pelo TanStack Query (nada de useEffect).
 */

export type PushSupport =
  | "ok"
  /** iPhone/iPad fora do app instalado: só funciona aberto pelo ícone da tela de início. */
  | "ios-install"
  | "unsupported";

const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

export function pushSupport(): PushSupport {
  const has = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (isIOS() && !isStandalone()) return "ios-install";
  return has ? "ok" : "unsupported";
}

export const permission = (): NotificationPermission =>
  "Notification" in window ? Notification.permission : "denied";

/** Rótulo do aparelho para a lista em Configurações. */
export function deviceName(ua = navigator.userAgent) {
  const os = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Windows/.test(ua)
          ? "Windows"
          : /Mac OS/.test(ua)
            ? "Mac"
            : "Computador";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
      ? "Chrome"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Safari\//.test(ua)
          ? "Safari"
          : "Navegador";
  return `${os} · ${browser}`;
}

/** Service worker do PWA (em dev, sem build, ele não existe: desiste em 4 s). */
async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000)),
  ]);
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const b64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
}

async function register(sub: PushSubscription) {
  const json = sub.toJSON();
  await readJson(
    await api.push.subscriptions.$post({
      json: {
        endpoint: sub.endpoint,
        keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" },
        device: deviceName(),
      },
    }),
  );
}

export const pushConfigQuery = queryOptions({
  queryKey: ["push", "config"],
  queryFn: async () => readJson<PushConfig>(await api.push.config.$get()),
  staleTime: Number.POSITIVE_INFINITY,
});

export const pushDevicesQuery = queryOptions({
  queryKey: ["push", "devices"],
  queryFn: async () => readJson<PushDevice[]>(await api.push.subscriptions.$get()),
});

/**
 * Inscrição atual deste aparelho (endpoint) ou null. Se existe, reenvia para a API: mantém as
 * chaves em dia e, se o aparelho trocou de conta, passa a ser da conta atual.
 */
export const pushSubscriptionQuery = queryOptions({
  queryKey: ["push", "subscription"],
  queryFn: async (): Promise<string | null> => {
    if (pushSupport() !== "ok" || permission() !== "granted") return null;
    const reg = await registration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return null;
    await register(sub).catch(() => {});
    return sub.endpoint;
  },
  staleTime: 60_000,
});

/**
 * Ativa as notificações neste aparelho. Precisa ser chamado direto do toque no botão: o pedido de
 * permissão é a primeira coisa (o Safari exige o gesto do usuário).
 */
export async function enablePush(publicKey: string, asked: Promise<NotificationPermission>): Promise<string> {
  const result = await asked;
  if (result !== "granted") throw new Error(result === "denied" ? "negado" : "ignorado");
  const reg = await registration();
  if (!reg) throw new Error("sem_service_worker");
  const key = keyBytes(publicKey);
  let sub = await reg.pushManager.getSubscription();
  // Inscrição feita com outra chave (troca de chaves no servidor): refaz.
  const current = sub?.options.applicationServerKey;
  if (sub && current && !sameBytes(new Uint8Array(current), key)) {
    await sub.unsubscribe();
    sub = null;
  }
  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    } catch {
      // Janela anônima, navegador sem serviço de push ou bloqueio do sistema.
      throw new Error("inscricao_recusada");
    }
  }
  await register(sub);
  return sub.endpoint;
}

function sameBytes(a: Uint8Array, b: Uint8Array) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export async function disablePush(endpoint: string) {
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  await sub?.unsubscribe().catch(() => false);
  const res = await api.push.subscriptions.$delete({ json: { endpoint } });
  if (!res.ok) await readJson(res);
}

export const testPush = async (endpoint: string) =>
  readJson<PushTestResult>(await api.push.test.$post({ json: { endpoint } }));
