import { useSyncExternalStore } from "react";

/**
 * Modo privacidade: borra todos os valores (classes .num / .num-display) para usar o app
 * em público. Fica salvo no aparelho; aplicado antes de pintar por public/theme.js.
 */
const KEY = "miu-privacy";
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === "on";
  } catch {
    return false;
  }
}

function apply(on: boolean) {
  if (on) document.documentElement.setAttribute("data-privacy", "on");
  else document.documentElement.removeAttribute("data-privacy");
}

export function setPrivacy(on: boolean) {
  try {
    if (on) localStorage.setItem(KEY, "on");
    else localStorage.removeItem(KEY);
  } catch {}
  apply(on);
  for (const l of listeners) l();
}

export function usePrivacy(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
    () => false,
  );
  return [on, setPrivacy];
}
