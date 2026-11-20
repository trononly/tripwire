import { useCallback, useEffect, useRef, useState } from "react";
import { Events } from "@wailsio/runtime";
import {
  startUssdQuickEntry,
  type UssdAutoEvent,
} from "@/lib/sms-bridge";
import { canStartQuickEntry, isInterruptionCode } from "@/lib/automation-status";
import type { QuickEntryScript } from "@/lib/ussd-menus";
import {
	clearPendingGuidedPayment,
	markPendingGuidedPayment,
} from "@/lib/pending-payment";

export type QuickEntryStatus =
  | "idle"
  | "starting"
  | "step"
  | "awaiting-pin"
  | "awaiting-confirm"
  | "complete"
  | "aborted"
  | "interrupted";

/**
 * Runs one guided USSD session: subscribes to the service's progress events,
 * dials via startUssdQuickEntry, and unsubscribes on terminal states and
 * unmount. The PIN is always entered manually in the phone dialog; the
 * payment itself is confirmed by the SMS receipt, never here.
 */
export function useQuickEntry() {
  const [status, setStatus] = useState<QuickEntryStatus>("idle");
  const [step, setStep] = useState(0);
  const [steps, setSteps] = useState(0);
  const [reason, setReason] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const offRef = useRef<(() => void) | null>(null);
  const startOffRef = useRef<(() => void) | null>(null);
  const floorRef = useRef(0);
  const statusRef = useRef<QuickEntryStatus>("idle");
  statusRef.current = status;
  // Synchronous guard: a double tap can land before React re-renders the
  // disabled button. It must never start a second USSD session.
  const activeRef = useRef(false);

  const cleanup = useCallback(() => {
    window.clearTimeout(floorRef.current);
    offRef.current?.();
    offRef.current = null;
    startOffRef.current?.();
    startOffRef.current = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  // Returning to the app means the USSD dialog closed: the user either paid
  // or cancelled, and Android exposes no cancel signal (see the USSD bridge
  // note). The real foreground signal is the native resume hook above, not
  // DOM visibility, which this WebView does not deliver. Give queued events
  // a moment, then release the run so Pay now is usable again.
  useEffect(() => {
    let timer = 0;
    const onForeground = () => {
      if (document.visibilityState !== "visible") return;
      const current = statusRef.current;
      if (
        current !== "starting" &&
        current !== "step" &&
        current !== "awaiting-pin" &&
        current !== "awaiting-confirm"
      ) {
        return;
      }
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const now = statusRef.current;
        if (
          now === "starting" ||
          now === "step" ||
          now === "awaiting-pin" ||
          now === "awaiting-confirm"
        ) {
          activeRef.current = false;
          cleanup();
          setStatus("interrupted");
          setCode("outcome-unknown");
          setReason("automation did not report completion");
          clearPendingGuidedPayment();
        }
      }, 2500);
    };
    window.addEventListener("mpesa:foreground", onForeground);
    document.addEventListener("visibilitychange", onForeground);
    window.addEventListener("focus", onForeground);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("mpesa:foreground", onForeground);
      document.removeEventListener("visibilitychange", onForeground);
      window.removeEventListener("focus", onForeground);
    };
  }, [cleanup]);

  const dismiss = useCallback(() => {
    activeRef.current = false;
    setStatus("idle");
    setReason(null);
    setCode(null);
  }, []);

  const start = useCallback(
    (script: QuickEntryScript, simKey?: string | null) => {
      if (!canStartQuickEntry(statusRef.current, activeRef.current)) return;
      activeRef.current = true;
      cleanup();
      setStatus("starting");
      setStep(0);
      setSteps(script.steps.length);
      setReason(null);
      setCode(null);
      // The receipt banner is only automatic for a payment this session
      // started; it stays valid for the SMS window in pending-payment.ts.
      markPendingGuidedPayment();
      // A failed dial (permission, automation off) must not leave the marker
      // armed for an unrelated spend in the next ten minutes, and must not
      // latch the button: a dial that never placed has no result coming.
      startOffRef.current = Events.Once("common:ussd", (ev) => {
        const data = ev.data as { ok?: boolean };
        if (data && data.ok === false) {
          clearPendingGuidedPayment();
          activeRef.current = false;
          cleanup();
          setStatus("interrupted");
          setCode("dial-failed");
          setReason("the phone did not place the call");
        }
      });
      offRef.current = Events.On("common:ussd-auto", (ev) => {
        const data = ev.data as UssdAutoEvent;
        if (!data || typeof data.state !== "string") return;
        switch (data.state) {
          case "step":
            setStatus("step");
            setStep(data.step ?? 0);
            if (data.steps) setSteps(data.steps);
            break;
          case "awaiting-pin":
            setStatus("awaiting-pin");
            break;
          case "awaiting-confirm":
            // Keep listening: the cancel happens after this prompt, and the
            // service stops watching here. Unsubscribing now is what left
            // the run latched forever.
            setStatus("awaiting-confirm");
            break;
          case "complete":
            activeRef.current = false;
            setStatus("complete");
            cleanup();
            break;
          case "aborted": {
            const abortCode = data.code ?? null;
            const interrupted = isInterruptionCode(abortCode);
            activeRef.current = false;
            setStatus(interrupted ? "interrupted" : "aborted");
            setCode(abortCode);
            setReason(data.reason ?? "aborted");
            clearPendingGuidedPayment();
            cleanup();
            break;
          }
        }
      });
      // Floor of last resort: Android never reports a cancel, so a run that
      // hears nothing for three minutes releases itself with the unknown
      // outcome instead of refusing the next payment forever.
      floorRef.current = window.setTimeout(() => {
        const now = statusRef.current;
        if (
          now === "starting" ||
          now === "step" ||
          now === "awaiting-pin" ||
          now === "awaiting-confirm"
        ) {
          activeRef.current = false;
          cleanup();
          setStatus("interrupted");
          setCode("outcome-unknown");
          setReason("no result after three minutes");
          clearPendingGuidedPayment();
        }
      }, 190_000);
      startUssdQuickEntry(script, simKey);
    },
    [cleanup],
  );

  return { status, step, steps, reason, code, start, dismiss };
}
