"use client";

import { useSyncExternalStore } from "react";

// One shared ticker keeps every relative time on screen in step.
const listeners = new Set<() => void>();
let now = Date.now();
let timer: ReturnType<typeof setInterval> | undefined;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      listeners.forEach((l) => l());
    }, 15_000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

const getSnapshot = () => now;
const getServerSnapshot = () => 0;

/** Current time, refreshed every 15 seconds. */
export function useNow(): Date {
  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return new Date(value || Date.now());
}
