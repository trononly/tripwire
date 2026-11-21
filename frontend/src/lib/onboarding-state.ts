import { useSyncExternalStore } from "react";

import { STEPS } from "@/lib/onboarding-steps";

// The mpesa-analyzer. prefix is the app's own settings namespace: Reset
// app clears it, so a fully reset app replays the tour on next launch.
const DONE_KEY = "mpesa-analyzer.onboarding.done";
const SEEN_KEY = "mpesa-analyzer.onboarding.seen";

function readDone(): boolean {
  try {
    return localStorage.getItem(DONE_KEY) === "1";
  } catch {
    return false;
  }
}

function readSeen(): string[] | null {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === "string");
  } catch {
    return [];
  }
}

/**
 * Before this release the tour was one done flag. A user who had finished it
 * has met every step this release ships, so seed the seen set from the
 * registry once. An unfinished user starts with nothing seen and gets the
 * whole tour.
 */
function loadSeen(): ReadonlySet<string> {
  const stored = readSeen();
  if (stored !== null) return new Set(stored);
  if (!readDone()) return new Set();
  const migrated = new Set(STEPS.map((step) => step.id));
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...migrated]));
  } catch {
    /* private mode: migrated for this session only */
  }
  return migrated;
}

// One shared store: the developer-tools restart and the mounted tour must
// agree without a provider, and a restart has to reopen the tour live.
let done = readDone();
let seen = loadSeen();
// Bumped by restart(), so the tour remounts even when it is already open.
let session = 0;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function getSeenSteps(): ReadonlySet<string> {
  return seen;
}

function getDone(): boolean {
  return done;
}

function getSession(): number {
  return session;
}

/**
 * Finish or skip: every step the user was shown counts as seen, and the old
 * done flag stays set for the demo-seeding guard. Steps skipped over stay
 * unseen and open the tour next launch.
 */
export function finishOnboarding(shownIds: readonly string[]): void {
  const next = new Set(seen);
  for (const id of shownIds) next.add(id);
  seen = next;
  done = true;
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...next]));
    localStorage.setItem(DONE_KEY, "1");
  } catch {
    /* private mode: finished for this session only */
  }
  notify();
}

/** Clear the seen set and the done flag so every step opens again, live. */
export function restart(): void {
  done = false;
  seen = new Set();
  session += 1;
  try {
    localStorage.removeItem(DONE_KEY);
    localStorage.removeItem(SEEN_KEY);
  } catch {
    /* private mode: nothing was stored */
  }
  notify();
}

export function useOnboardingState(): {
  done: boolean;
  seen: ReadonlySet<string>;
  session: number;
} {
  const doneValue = useSyncExternalStore(subscribe, getDone);
  const seenValue = useSyncExternalStore(subscribe, getSeenSteps);
  const sessionValue = useSyncExternalStore(subscribe, getSession);
  return { done: doneValue, seen: seenValue, session: sessionValue };
}

// The demo statement the tour seeded, persisted so a kill mid-tour keeps
// the removal option alive. Same namespace: Reset app drops it too.
const DEMO_KEY = "mpesa-analyzer.onboarding.demo";

function readDemoId(): string | null {
  try {
    return localStorage.getItem(DEMO_KEY);
  } catch {
    return null;
  }
}

let demoId: string | null = readDemoId();
const demoListeners = new Set<() => void>();

function subscribeDemo(cb: () => void) {
  demoListeners.add(cb);
  return () => {
    demoListeners.delete(cb);
  };
}

export function getDemoId(): string | null {
  return demoId;
}

export function setDemoId(id: string): void {
  demoId = id;
  try {
    localStorage.setItem(DEMO_KEY, id);
  } catch {
    /* private mode: the id lives for this session only */
  }
  demoListeners.forEach((listener) => listener());
}

export function clearDemoId(): void {
  demoId = null;
  try {
    localStorage.removeItem(DEMO_KEY);
  } catch {
    /* nothing was stored */
  }
  demoListeners.forEach((listener) => listener());
}

export function useDemoId(): string | null {
  return useSyncExternalStore(subscribeDemo, getDemoId);
}
