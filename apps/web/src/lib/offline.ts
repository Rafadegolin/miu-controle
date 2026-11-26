import type { CreateTransaction, Me, Transaction } from "@miu/shared";
import type { QueryClient } from "@tanstack/react-query";
import { createTransaction, invalidateMoney } from "./finance";
import { ApiRequestError } from "./http";

/*
 * Lançar sem internet.
 * - Cache: me, contas, categorias e sugestões ficam no aparelho para o app abrir offline.
 *   Ao restaurar, entram como desatualizados: com internet, tudo é buscado de novo na hora.
 * - Fila: lançamento feito sem conexão fica guardado com um clientId (UUID). Reenviar o mesmo
 *   clientId não duplica (a API devolve o que já existe). Cada item é da conta que o criou.
 * Sair da conta apaga os dois.
 */

const CACHE_KEY = "miu-cache-v1";
const QUEUE_KEY = "miu-fila-v1";
const PERSISTED = ["me", "accounts", "categories", "suggestions"];

type Pending = { clientId: string; userId: string; body: CreateTransaction; createdAt: number };

const read = <T>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};
const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // armazenamento cheio ou bloqueado: segue sem cache
  }
};

/* ---------- cache das consultas ---------- */

export function restoreCache(queryClient: QueryClient) {
  const saved = read<Record<string, unknown>>(CACHE_KEY, {});
  for (const key of PERSISTED) {
    if (saved[key] !== undefined) queryClient.setQueryData([key], saved[key], { updatedAt: 0 });
  }
}

export function persistCache(queryClient: QueryClient) {
  queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== "updated" || event.action.type !== "success") return;
    const key = event.query.queryKey;
    if (key.length !== 1 || !PERSISTED.includes(String(key[0]))) return;
    const saved = read<Record<string, unknown>>(CACHE_KEY, {});
    // Sessão acabou (me = null): nada de dados do usuário no aparelho.
    if (key[0] === "me" && event.query.state.data === null) {
      clearOfflineCache();
      return;
    }
    saved[String(key[0])] = event.query.state.data;
    write(CACHE_KEY, saved);
  });
}

export function clearOfflineCache() {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {}
}

/** Sair da conta / excluir conta: apaga cache e fila deste aparelho. */
export function clearOfflineData() {
  clearOfflineCache();
  try {
    localStorage.removeItem(QUEUE_KEY);
  } catch {}
  emit();
}

/* ---------- fila ---------- */

let queue: Pending[] = read<Pending[]>(QUEUE_KEY, []);
let online = typeof navigator === "undefined" ? true : navigator.onLine;
const listeners = new Set<() => void>();
let snapshot = { pending: queue.length, online };
function emit() {
  queue = read<Pending[]>(QUEUE_KEY, []);
  snapshot = { pending: queue.length, online };
  for (const l of listeners) l();
}
const save = (list: Pending[]) => {
  write(QUEUE_KEY, list);
  emit();
};

export const offlineStore = {
  subscribe(cb: () => void) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
  get: () => snapshot,
};

/** Sem resposta do servidor (sem internet, servidor fora): vale tentar de novo depois. */
export function isRetryable(e: unknown) {
  if (e instanceof TypeError) return true; // fetch falhou: sem conexão
  return e instanceof ApiRequestError && (e.status >= 500 || e.status === 408 || e.body.erro === "erro_rede");
}

export type SaveResult = { queued: false; tx: Transaction } | { queued: true; clientId: string };

/** Cria o lançamento; sem conexão, guarda na fila e envia depois. */
export async function createOrQueue(body: CreateTransaction, userId: string): Promise<SaveResult> {
  const clientId = crypto.randomUUID();
  const withId = { ...body, clientId } as CreateTransaction;
  const enqueue = (): SaveResult => {
    save([...read<Pending[]>(QUEUE_KEY, []), { clientId, userId, body: withId, createdAt: Date.now() }]);
    return { queued: true, clientId };
  };
  if (!navigator.onLine) return enqueue();
  try {
    return { queued: false, tx: await createTransaction(withId) };
  } catch (e) {
    // Mesmo clientId na fila: se o servidor chegou a salvar, o reenvio não duplica.
    if (isRetryable(e)) return enqueue();
    throw e;
  }
}

export function removeQueued(clientId: string) {
  save(read<Pending[]>(QUEUE_KEY, []).filter((p) => p.clientId !== clientId));
}

let flushing = false;

/** Envia a fila da conta atual, em ordem. Para no primeiro erro de conexão. */
export async function flushQueue(queryClient: QueryClient, onRejected?: (msg: string) => void) {
  const me = queryClient.getQueryData<Me | null>(["me"]);
  if (flushing || !me || !navigator.onLine) return;
  flushing = true;
  let sent = 0;
  try {
    for (const item of read<Pending[]>(QUEUE_KEY, []).filter((p) => p.userId === me.id)) {
      try {
        await createTransaction(item.body);
        sent++;
        removeQueued(item.clientId);
      } catch (e) {
        if (isRetryable(e)) break;
        // Recusado de vez (ex.: conta excluída no meio do caminho): tira da fila e avisa.
        removeQueued(item.clientId);
        onRejected?.(
          e instanceof ApiRequestError ? e.message : "Um lançamento guardado não pôde ser enviado.",
        );
      }
    }
  } finally {
    flushing = false;
  }
  if (sent > 0) await invalidateMoney(queryClient);
  return sent;
}

/** Liga tudo: restaura o cache, guarda as próximas respostas e envia a fila quando der. */
export function startOffline(queryClient: QueryClient, notify: (msg: string) => void) {
  restoreCache(queryClient);
  persistCache(queryClient);
  const flush = () =>
    void flushQueue(queryClient, notify).then((sent) => {
      if (sent)
        notify(
          sent === 1 ? "1 lançamento guardado foi enviado" : `${sent} lançamentos guardados foram enviados`,
        );
    });
  window.addEventListener("online", () => {
    online = true;
    emit();
    flush();
  });
  window.addEventListener("offline", () => {
    online = false;
    emit();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") flush();
  });
  // Quando o "me" chega (login ou abertura do app), tenta enviar o que ficou guardado.
  queryClient.getQueryCache().subscribe((event) => {
    if (event.type === "updated" && event.action.type === "success" && event.query.queryKey[0] === "me")
      flush();
  });
  window.addEventListener("storage", (e) => {
    if (e.key === QUEUE_KEY) emit();
  });
}
