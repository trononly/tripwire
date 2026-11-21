import { useCallback, useRef } from "react";
import type {
  MouseEvent as ReactMouseEvent,
  TouchEvent as ReactTouchEvent,
} from "react";

import { vibrateIfEnabled } from "@/lib/motion-settings";

const HOLD_MS = 450;
const CANCEL_PX = 12;

function startsOnNestedControl(target: EventTarget | null, row: EventTarget | null): boolean {
  const start = (target as HTMLElement | null)?.closest(
    "button, a, input, select, textarea",
  );
  return start !== null && start !== row;
}

/**
 * Touch long press for rows that must keep their plain tap. Spread the
 * returned handlers on the row next to any onClick: the hold fires once,
 * with a short haptic, and a fired hold swallows the click that would
 * otherwise land on lift. Touch only, so a mouse never waits out a timer;
 * the same menu reaches mouse users through the returned onContextMenu.
 */
export function useLongPress(onLongPress: () => void) {
  const timer = useRef<number | null>(null);
  const fired = useRef(false);
  const origin = useRef<{ x: number; y: number } | null>(null);

  const cancel = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const fire = useCallback(() => {
    timer.current = null;
    fired.current = true;
    vibrateIfEnabled(10);
    onLongPress();
  }, [onLongPress]);

  return {
    onTouchStart(event: ReactTouchEvent) {
      if (
        startsOnNestedControl(event.target, event.currentTarget)
      ) {
        return;
      }
      if (event.touches.length !== 1) {
        cancel();
        return;
      }
      const touch = event.touches[0];
      if (!touch) return;
      origin.current = { x: touch.clientX, y: touch.clientY };
      fired.current = false;
      cancel();
      timer.current = window.setTimeout(fire, HOLD_MS);
    },
    onTouchMove(event: ReactTouchEvent) {
      const start = origin.current;
      const touch = event.touches[0];
      if (!start || !touch) return;
      if (
        Math.abs(touch.clientX - start.x) > CANCEL_PX ||
        Math.abs(touch.clientY - start.y) > CANCEL_PX
      ) {
        cancel();
      }
    },
    onTouchEnd(event: ReactTouchEvent) {
      cancel();
      if (fired.current) event.preventDefault();
      origin.current = null;
    },
    onTouchCancel() {
      cancel();
      origin.current = null;
    },
    onContextMenu(event: ReactMouseEvent) {
      if (
        startsOnNestedControl(event.target, event.currentTarget)
      ) {
        return;
      }
      // Desktop stand-in for the hold, and it also eats the native menu an
      // Android hold raises after the haptic has already opened ours.
      event.preventDefault();
      if (!fired.current) onLongPress();
    },
  };
}
