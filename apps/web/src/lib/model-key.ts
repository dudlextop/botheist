"use client";

import { useSyncExternalStore } from "react";

/*
 * The player's own Claude API key lives only in this browser. It is sent with
 * the request that starts an attempt (or an organizer's regression check);
 * the server seals it for that attempt and erases it when the attempt ends.
 */
const STORAGE_KEY = "bh_claude_api_key";
const EVENT = "bh-model-key";
// Fallback when storage is blocked (private mode): the key lasts for this page only.
let memoryKey: string | null = null;

function read(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveModelKey(key: string | null) {
  try {
    if (key) window.localStorage.setItem(STORAGE_KEY, key);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    memoryKey = key;
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) onChange();
  };
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** The saved key, or null. Always null during server rendering. */
export function useModelKey(): string | null {
  return useSyncExternalStore(subscribe, () => read() ?? memoryKey, () => null);
}

export function maskKey(key: string): string {
  return `${key.slice(0, 7)}…${key.slice(-4)}`;
}

export const BRAIN_LABEL: Record<string, string> = {
  OFFLINE: "Offline Milo, a scripted stand-in",
  PLAYER_KEY: "Claude, on your API key",
  SERVER_KEY: "Claude",
};
