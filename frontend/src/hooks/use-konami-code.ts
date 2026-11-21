import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { toast } from "sonner";

const DEBUG_KEY = "mpesa-analyzer.debug";

function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* desktop / no haptics: silent no-op */
  }
}

const listeners = new Set<() => void>();
let unlocked = (() => {
  try {
    return localStorage.getItem(DEBUG_KEY) === "1";
  } catch {
    return false;
  }
})();

function setUnlocked(next: boolean) {
  if (next === unlocked) return;
  unlocked = next;
  try {
    if (next) localStorage.setItem(DEBUG_KEY, "1");
    else localStorage.removeItem(DEBUG_KEY);
  } catch {
    /* private mode: debug stays session-only */
  }
  if (next) {
    vibrate([20, 30, 20]);
    toast.success("Developer mode on");
  } else {
    vibrate([30, 20]);
    toast("Developer mode off");
  }
  listeners.forEach((l) => l());
}

/** Unlock or lock developer tools from the debug console. */
export function setDevMode(next: boolean) {
	setUnlocked(next);
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot() {
  return unlocked;
}

// Up Up Down Down Left Right Left Right B A. Letters match either case.
const KONAMI = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeft",
  "ArrowRight",
  "b",
  "a",
];

/**
 * Hidden developer tools for Tripwire. Desktop: type the Konami code.
 * Touch: tap the Settings nav item ten times within three seconds, the
 * Android build-number pattern. Unlock persists in localStorage.
 */
export function useDevMode() {
  const unlocked = useSyncExternalStore(subscribe, getSnapshot);
  const progress = useRef(0);
  const taps = useRef<number[]>([]);

  useEffect(() => {
    if (unlocked) return;
    const onKey = (e: KeyboardEvent) => {
      const got = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (got === KONAMI[progress.current]) {
        progress.current += 1;
        if (progress.current === KONAMI.length) setUnlocked(true);
      } else {
        progress.current = got === KONAMI[0] ? 1 : 0;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [unlocked]);

  const tap = useCallback(() => {
    vibrate(15);
    const now = Date.now();
    taps.current = [...taps.current.filter((t) => now - t < 3000), now];
    if (taps.current.length >= 10) {
      taps.current = [];
      setUnlocked(!unlocked);
    }
  }, [unlocked]);

  return { unlocked, tap };
}
