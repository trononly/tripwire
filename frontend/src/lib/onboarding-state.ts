import { useSyncExternalStore } from "react";

// The mpesa-analyzer. prefix is the app's own settings namespace: Reset
// app clears it, so a fully reset app replays the tour on next launch.
const DONE_KEY = "mpesa-analyzer.onboarding.done";

function readDone(): boolean {
  try {
    return localStorage.getItem(DONE_KEY) === "1";
  } catch {
    return false;
  }
}

// One shared flag: the developer-tools restart and the mounted tour must
// agree without a provider, and a restart has to reopen the tour live.
let done = readDone();
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function isDone(): boolean {
  return done;
}

export function markDone(): void {
  if (done) return;
  done = true;
  try {
    localStorage.setItem(DONE_KEY, "1");
  } catch {
    /* private mode: finished for this session only */
  }
  listeners.forEach((listener) => listener());
}

/** Clear the flag so the tour opens again, without a relaunch. */
export function restart(): void {
  done = false;
  try {
    localStorage.removeItem(DONE_KEY);
  } catch {
    /* private mode: nothing was stored */
  }
  listeners.forEach((listener) => listener());
}

export function useOnboardingState(): { done: boolean } {
  const value = useSyncExternalStore(subscribe, isDone);
  return { done: value };
}
