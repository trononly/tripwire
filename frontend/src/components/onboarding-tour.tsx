import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { useReduceMotionEnabled } from "@/lib/motion-settings";
import { markDone, useOnboardingState } from "@/lib/onboarding-state";
import { isAndroidBridge, requestNotificationPermission } from "@/lib/sms-bridge";
import { cn } from "@/lib/utils";

type Pose = "wave" | "point" | "smug" | "flustered" | "proud";

/** The element a step lights up: hooks the app already renders, no new ones. */
type StepTarget = {
  /** CSS selector for the target, using hooks the app already renders. */
  selector: string;
  /** Disambiguates a selector that matches several elements (card titles). */
  text?: string;
  /** Measures this ancestor instead of the matched hook, e.g. the whole card. */
  closest?: string;
};

type TourStep = {
  id: string;
  title: string;
  /** One line in the teacher's voice. The lesson stays in `body`. */
  quip: string;
  body: string;
  pose: Pose;
  /** Hash route the app must be on before the target exists. */
  route: string;
  /** Null for a closing card with nothing on the app to point at. */
  target: StepTarget | null;
};

const STEPS: readonly TourStep[] = [
  {
    id: "home",
    title: "This is your money, at a glance",
    quip: "The number you came for. I saved you the scrolling.",
    body: "The hero is the balance at the end of your latest statement, with money in and out for the last 30 days. Nothing active yet? This card is where you pick or import a statement.",
    pose: "point",
    route: "/",
    target: { selector: 'main [data-slot="card"]' },
  },
  {
    id: "pay",
    title: "Pay without hunting menus",
    quip: "The Pay button. Where your thumb already lives.",
    body: "Four destinations: send money, Pochi la Biashara, pay bill and buy goods. Tripwire fills the M-Pesa menu and stops at your PIN.",
    pose: "smug",
    route: "/",
    target: { selector: 'nav button[aria-label="Pay"]' },
  },
  {
    id: "breakdown",
    title: "Every shilling gets a name",
    quip: "It went somewhere. I made it confess.",
    body: "The ring splits the last 30 days by category. Tap one to open those rows in Transactions.",
    pose: "smug",
    route: "/",
    target: {
      selector: 'main svg[aria-label^="Spending by category"]',
      closest: '[data-slot="card"]',
    },
  },
  {
    id: "coming-up",
    title: "The bills that arrive anyway",
    quip: "These ones don't forget you. I checked.",
    body: "Coming up lists your repeating payments and when they land. Press and hold one, or tap it, to edit or delete it.",
    pose: "flustered",
    route: "/",
    target: {
      selector: 'main [data-slot="card"]',
      text: "Coming up",
    },
  },
  {
    id: "history",
    title: "One statement at a time",
    quip: "That chip in the corner is the whole filing cabinet.",
    body: "The top-bar chip opens your statement history: switch the active statement, delete one, or import a fresh M-Pesa PDF.",
    pose: "proud",
    route: "/",
    target: {
      selector: "header button:has(svg.lucide-chevron-down)",
    },
  },
  {
    id: "ledger",
    title: "Every row opens its receipt",
    quip: "Go on, poke one. I'll wait.",
    body: "Tap a row for the receipt: amount, balance after, description and reference. Filters narrow the list; the row icon labels it.",
    pose: "point",
    route: "/transactions",
    target: {
      selector:
        'main section button[aria-label^="Set category"] + button, main section button[aria-label^="Change category"] + button',
    },
  },
  {
    id: "insights",
    title: "Pick the month you mean",
    quip: "Yes, that month. Pick another one if you must.",
    body: "The month tile scopes the whole page: the biggest finding, fees, who paid you most, and repeating bills.",
    pose: "flustered",
    route: "/insights",
    target: {
      selector: 'main button[aria-haspopup="dialog"]',
      text: "activity",
    },
  },
  {
    id: "privacy",
    title: "Keep the numbers to yourself",
    quip: "Someone is reading over your shoulder. I'll handle it.",
    body: "The eye blurs every figure until you tap it. Turn it off the same way.",
    pose: "proud",
    route: "/",
    target: {
      selector: 'header button[aria-label*="Privacy Mode"]',
    },
  },
  {
    id: "notifications",
    title: "A nudge before the bill",
    quip: "I'll warn you before the rent sneaks up. Try to look grateful.",
    body: "Notifications let Tripwire warn you before a repeating bill lands. Declining changes nothing else.",
    pose: "proud",
    route: "/",
    target: null,
  },
];

/** One veil colour in both themes: dim, not blur, and let the target stay true. */
const VEIL = "rgba(10, 10, 12, 0.72)";
/** Breathing room between the target and the cutout's edge. */
const CUTOUT_PAD = 6;
/** Gap between the cutout and the explanation card. */
const CARD_GAP = 12;
/** Space the card keeps from the viewport edges, before safe-area insets. */
const EDGE = 12;
const TARGET_TIMEOUT_MS = 4000;
const SETTLE_GRACE_MS = 600;

function readInset(side: "top" | "bottom" | "left" | "right"): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(
    `--safe-${side}`,
  );
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/** Pick the element a step points at, skipping hidden duplicates. */
function resolveTarget(target: StepTarget): HTMLElement | null {
  const nodes = document.querySelectorAll<HTMLElement>(target.selector);
  for (const node of nodes) {
    if (target.text && !(node.textContent ?? "").includes(target.text)) continue;
    const el = target.closest
      ? (node.closest<HTMLElement>(target.closest) ?? null)
      : node;
    if (!el) continue;
    const box = el.getBoundingClientRect();
    if (box.width < 8 || box.height < 8) continue;
    const style = getComputedStyle(el);
    if (style.visibility === "hidden" || style.display === "none") continue;
    return el;
  }
  return null;
}

/** The app paints route content a tick after the hash changes. */
function onRoute(route: string): boolean {
  const hash = window.location.hash.replace(/^#/, "").split("?")[0];
  return (hash || "/") === route;
}

/** Skeletons and busy cards mean "wait", not "this step has no target". */
function appSettled(): boolean {
  const main = document.querySelector("main");
  if (!main) return false;
  return !main.querySelector('[data-slot="skeleton"], [aria-busy="true"]');
}

/** Fixed elements (the Pay bar, the header) never need a scroll. */
function isPinned(el: HTMLElement): boolean {
  if (el.closest("header, nav")) return true;
  for (let node: HTMLElement | null = el; node; node = node.parentElement) {
    if (getComputedStyle(node).position === "fixed") return true;
  }
  return false;
}

/** The viewport band a target must sit in: below the header, above the nav. */
function visibleBand(): { top: number; bottom: number } {
  const header = document.querySelector("header");
  const nav = document.querySelector("nav.fixed");
  const top = Math.max(header?.getBoundingClientRect().bottom ?? 0, 0) + EDGE;
  const bottom =
    (nav ? nav.getBoundingClientRect().top : window.innerHeight) - EDGE;
  return { top, bottom };
}

/**
 * Smooth scrolling starts a frame or two after `scrollTo`, so a run of
 * unchanged positions only counts after the page has actually moved.
 */
function waitForScrollEnd(startY: number): Promise<void> {
  return new Promise((resolve) => {
    const started = Date.now();
    let last = window.scrollY;
    let moved = window.scrollY !== startY;
    let still = 0;
    const tick = () => {
      if (window.scrollY !== startY) moved = true;
      if (window.scrollY === last) still += 1;
      else {
        still = 0;
        last = window.scrollY;
      }
      if ((moved && still >= 3) || Date.now() - started > 900) resolve();
      else window.setTimeout(tick, 50);
    };
    window.setTimeout(tick, 50);
  });
}

/**
 * Scroll once. The document scroller is locked while the tour is up, but an
 * overflow-hidden scroller still accepts scripted scrolls, so no unlock is
 * needed (and the sticky header keeps its place).
 */
async function bringIntoView(el: HTMLElement, reduceMotion: boolean) {
  if (isPinned(el)) return;
  const box = el.getBoundingClientRect();
  const band = visibleBand();
  if (box.top >= band.top && box.bottom <= band.bottom) return;

  const room = Math.max(band.bottom - band.top, 1);
  const top =
    window.scrollY +
    box.top -
    (band.top + Math.max((room - box.height) / 2, 0));
  const startY = window.scrollY;
  window.scrollTo({
    top: Math.max(top, 0),
    behavior: reduceMotion ? "auto" : "smooth",
  });
  await waitForScrollEnd(startY);
}

function Arms({ pose }: { pose: Pose }) {
  const hand = (cx: number, cy: number) => (
    <circle cx={cx} cy={cy} r={5.5} className="fill-brand-strong" />
  );
  const arm = (d: string) => (
    <path
      d={d}
      fill="none"
      strokeWidth={9}
      strokeLinecap="round"
      className="stroke-brand-strong"
    />
  );
  switch (pose) {
    case "wave":
      return (
        <g>
          {arm("M33 64c-5 4-6 9-4 13")}
          {hand(28, 79)}
          {arm("M87 63c8-3 12-10 13-19")}
          {hand(101, 41)}
        </g>
      );
    case "point":
      return (
        <g>
          {arm("M33 64c-5 4-6 9-4 13")}
          {hand(28, 79)}
          {arm("M87 60c10 0 17-2 21-6")}
          {hand(110, 52)}
          <path
            d="M113 50l5-2"
            fill="none"
            strokeWidth={4}
            strokeLinecap="round"
            className="stroke-brand-strong"
          />
        </g>
      );
    case "smug":
      return (
        <g>
          {arm("M34 64c-8 3-11 9-9 15")}
          {hand(25, 80)}
          {arm("M86 64c8 3 11 9 9 15")}
          {hand(95, 80)}
        </g>
      );
    case "flustered":
      return (
        <g>
          {arm("M32 60c-7-4-10-10-10-16")}
          {hand(20, 38)}
          {arm("M88 60c7-4 10-10 10-16")}
          {hand(100, 38)}
        </g>
      );
    case "proud":
      return (
        <g>
          {arm("M32 58c-7-6-10-14-9-21")}
          {hand(22, 31)}
          {arm("M88 58c7-6 10-14 9-21")}
          {hand(98, 31)}
        </g>
      );
  }
}

function Face({ pose }: { pose: Pose }) {
  if (pose === "proud") {
    return (
      <g>
        <path
          d="M44 54c2.5-5 7.5-5 10 0"
          fill="none"
          strokeWidth={2.8}
          strokeLinecap="round"
          className="stroke-foreground"
        />
        <path
          d="M66 54c2.5-5 7.5-5 10 0"
          fill="none"
          strokeWidth={2.8}
          strokeLinecap="round"
          className="stroke-foreground"
        />
        <path
          d="M51 63c3 5 13 5 18 0"
          fill="none"
          strokeWidth={2.8}
          strokeLinecap="round"
          className="stroke-foreground"
        />
      </g>
    );
  }

  if (pose === "flustered") {
    return (
      <g>
        <circle cx={50} cy={53} r={4.4} className="fill-foreground" />
        <circle cx={70} cy={53} r={4.4} className="fill-foreground" />
        <path
          d="M43 43l10 3"
          fill="none"
          strokeWidth={2.4}
          strokeLinecap="round"
          className="stroke-foreground"
        />
        <path
          d="M77 43l-10 3"
          fill="none"
          strokeWidth={2.4}
          strokeLinecap="round"
          className="stroke-foreground"
        />
        <path
          d="M55 65h10"
          fill="none"
          strokeWidth={2.4}
          strokeLinecap="round"
          className="stroke-foreground"
        />
        <path
          d="M83 40c3 5 5 7 5 9a5 5 0 0 1-10 0c0-2 2-4 5-9Z"
          className="fill-background"
        />
      </g>
    );
  }

  if (pose === "point") {
    return (
      <g>
        <circle cx={50} cy={53} r={3.6} className="fill-foreground" />
        <circle cx={70} cy={53} r={3.6} className="fill-foreground" />
        <path
          d="M44 44h9"
          fill="none"
          strokeWidth={2.4}
          strokeLinecap="round"
          className="stroke-foreground"
        />
        <path
          d="M67 41l9-2"
          fill="none"
          strokeWidth={2.4}
          strokeLinecap="round"
          className="stroke-foreground"
        />
        <ellipse cx={60} cy={65} rx={3} ry={2.6} className="fill-foreground" />
      </g>
    );
  }

  // Wave and smug share the half-lidded teacher look.
  return (
    <g>
      <path
        d="M44 51h11"
        fill="none"
        strokeWidth={2.6}
        strokeLinecap="round"
        className="stroke-foreground"
      />
      <circle cx={50} cy={55} r={2.6} className="fill-foreground" />
      <path
        d="M65 51h11"
        fill="none"
        strokeWidth={2.6}
        strokeLinecap="round"
        className="stroke-foreground"
      />
      <circle cx={71} cy={55} r={2.6} className="fill-foreground" />
      <path
        d="M55 64c3 3 7 3 10-1"
        fill="none"
        strokeWidth={2.6}
        strokeLinecap="round"
        className="stroke-foreground"
      />
    </g>
  );
}

/** The mentor: a flat coral blob with a cowlick and a face per step. */
function Mascot({ pose, className }: { pose: Pose; className?: string }) {
  return (
    <svg
      viewBox="0 0 120 120"
      aria-hidden="true"
      className={cn("size-28 sm:size-32", className)}
    >
      <ellipse cx={60} cy={105} rx={24} ry={4} className="fill-muted" />
      <Arms pose={pose} />
      <path
        d="M60 26c17.5 0 31 13 31 30 0 18-13 32-31 32S29 74 29 56c0-17 13.5-30 31-30Z"
        className="fill-brand"
      />
      <path
        d="M58 26c-3-7 2-12 8-11-4 2-5 6-2 9"
        className="fill-brand-strong"
      />
      <Face pose={pose} />
    </svg>
  );
}

/**
 * First-run tour. Mounted for the life of the app and hidden once done, so
 * `restart()` from developer tools reopens it without a relaunch. Each step
 * lights up a real control on the real screen instead of describing it.
 */
export function OnboardingTour({
  onRemoveDemo,
}: {
  /** Deletes the seeded demo statement; the tour calls it on finish. */
  onRemoveDemo?: () => Promise<void> | void;
} = {}) {
  const { done } = useOnboardingState();
  const reduceMotion = useReduceMotionEnabled();
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [cardHeight, setCardHeight] = useState(0);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const askedNotification = useRef(false);
  const step = STEPS[Math.min(index, STEPS.length - 1)];
  const last = index === STEPS.length - 1;
  const located = rect !== null;
  const closing = step.target === null;

  // Lock the document scroller, not the body: an overflow-hidden body
  // becomes its own scroll container and un-sticks the top bar.
  useEffect(() => {
    if (done) return;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = previous;
    };
  }, [done]);

  // The veil is painted by a box-shadow, not by a hit-target, so the page
  // stays measurable underneath: swallow every press outside the card here.
  useEffect(() => {
    if (done) return;
    const swallow = (event: Event) => {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-tour-card]")) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    window.addEventListener("pointerdown", swallow, true);
    window.addEventListener("click", swallow, true);
    return () => {
      window.removeEventListener("pointerdown", swallow, true);
      window.removeEventListener("click", swallow, true);
    };
  }, [done]);

  const finish = useCallback(() => {
    askedNotification.current = false;
    setIndex(0);
    setRect(null);
    markDone();
    void onRemoveDemo?.();
  }, [onRemoveDemo]);

  const advance = useCallback(() => {
    setRect(null);
    if (index === STEPS.length - 1) finish();
    else setIndex((current) => current + 1);
  }, [finish, index]);

  // The notification ask belongs here, not in Settings: the first reminder
  // needs POST_NOTIFICATIONS, and this is the one moment the user is being
  // walked through the app. A decline is final for the tour; no re-ask.
  useEffect(() => {
    if (done || step.id !== "notifications" || askedNotification.current) {
      return;
    }
    askedNotification.current = true;
    if (isAndroidBridge()) requestNotificationPermission();
  }, [done, step.id]);

  // Per step: navigate, wait for the target (and the app) to settle, bring
  // it into view at most once, then measure it.
  useEffect(() => {
    if (done) return;
    let cancelled = false;
    let timer = 0;
    const current = STEPS[index];
    const target = current.target;
    // Re-navigating to the current route pushes a history entry and makes
    // ScrollToTop jump to the top, which would fight the step's own scroll.
    if (!onRoute(current.route)) navigate(current.route);
    if (!target) {
      setRect(null);
      return;
    }

    const started = Date.now();
    const tick = () => {
      if (cancelled) return;
      const el = onRoute(current.route) ? resolveTarget(target) : null;
      if (el) {
        void bringIntoView(el, reduceMotion).then(() => {
          if (cancelled) return;
          setRect(el.getBoundingClientRect());
          // The first measure can land before a card finishes growing; one
          // quiet re-measure keeps the cutout honest without a loop.
          timer = window.setTimeout(() => {
            if (cancelled) return;
            const again = resolveTarget(target);
            if (again) setRect(again.getBoundingClientRect());
          }, 350);
        });
        return;
      }
      const waited = Date.now() - started;
      const settledHere = onRoute(current.route) && appSettled();
      const missing =
        waited > TARGET_TIMEOUT_MS || (waited > SETTLE_GRACE_MS && settledHere);
      if (missing) {
        if (index === STEPS.length - 1) finish();
        else setIndex(index + 1);
        return;
      }
      timer = window.setTimeout(tick, 100);
    };
    tick();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [done, finish, index, navigate, reduceMotion]);

  // A rotation, a window resize or a card that grows must move the hole with
  // the target. Re-measure only; never scroll again inside a step.
  useEffect(() => {
    if (done || !located || !step.target) return;
    const target = step.target;
    const remeasure = () => {
      const el = resolveTarget(target);
      if (el) setRect(el.getBoundingClientRect());
    };
    window.addEventListener("resize", remeasure);
    window.addEventListener("orientationchange", remeasure);
    window.visualViewport?.addEventListener("resize", remeasure);
    return () => {
      window.removeEventListener("resize", remeasure);
      window.removeEventListener("orientationchange", remeasure);
      window.visualViewport?.removeEventListener("resize", remeasure);
    };
  }, [done, located, step]);

  useLayoutEffect(() => {
    const node = cardRef.current;
    if (!node || done) return;
    const measure = () => setCardHeight(node.getBoundingClientRect().height);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [done, located, step.id]);

  if (done) return null;

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const inset = {
    top: readInset("top"),
    bottom: readInset("bottom"),
    left: readInset("left"),
    right: readInset("right"),
  };
  const cardWidth = Math.max(
    Math.min(
      viewportWidth - Math.max(inset.left, EDGE) - Math.max(inset.right, EDGE),
      352,
    ),
    240,
  );

  let cardLeft = EDGE;
  let cardTop = 0;
  let cardMaxHeight = 0;
  let cutout: { top: number; left: number; width: number; height: number } | null =
    null;

  if (closing) {
    const maxHeight = Math.max(
      viewportHeight - inset.top - inset.bottom - EDGE * 2,
      240,
    );
    const height = cardHeight > 0 ? Math.min(cardHeight, maxHeight) : 320;
    cardMaxHeight = maxHeight;
    cardLeft = Math.min(
      Math.max(
        (viewportWidth - cardWidth) / 2,
        Math.max(inset.left, 0) + EDGE,
      ),
      viewportWidth - Math.max(inset.right, 0) - EDGE - cardWidth,
    );
    cardTop = Math.max(
      (viewportHeight - height) / 2,
      Math.max(inset.top, 0) + EDGE,
    );
  } else if (rect) {
    cutout = {
      top: rect.top - CUTOUT_PAD,
      left: rect.left - CUTOUT_PAD,
      width: rect.width + CUTOUT_PAD * 2,
      height: rect.height + CUTOUT_PAD * 2,
    };
    const spaceAbove =
      cutout.top - Math.max(inset.top, 0) - EDGE - CARD_GAP;
    const spaceBelow =
      viewportHeight -
      inset.bottom -
      EDGE -
      (cutout.top + cutout.height) -
      CARD_GAP;
    const placeBelow = spaceBelow >= spaceAbove;
    const room = Math.max(placeBelow ? spaceBelow : spaceAbove, 0);
    cardMaxHeight = Math.max(room, 180);
    const height = cardHeight > 0 ? Math.min(cardHeight, cardMaxHeight) : cardMaxHeight;
    cardTop = placeBelow
      ? cutout.top + cutout.height + CARD_GAP
      : cutout.top - CARD_GAP - height;
    cardTop = Math.min(
      Math.max(cardTop, Math.max(inset.top, 0) + EDGE),
      viewportHeight - inset.bottom - EDGE - height,
    );
    cardLeft = Math.min(
      Math.max(
        cutout.left + cutout.width / 2 - cardWidth / 2,
        Math.max(inset.left, 0) + EDGE,
      ),
      viewportWidth - Math.max(inset.right, 0) - EDGE - cardWidth,
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      className="pointer-events-none fixed inset-0 z-[100]"
    >
      {closing && (
        <div
          aria-hidden="true"
          data-tour-veil
          className={cn(
            "pointer-events-none fixed inset-0",
            !reduceMotion && "animate-in fade-in duration-150",
          )}
          style={{ background: VEIL }}
        />
      )}

      {cutout && (
        <div
          aria-hidden="true"
          data-tour-cutout
          className={cn(
            "pointer-events-none fixed rounded-xl outline outline-1 outline-white/25",
            !reduceMotion && "animate-in fade-in duration-150",
          )}
          style={{
            top: cutout.top,
            left: cutout.left,
            width: cutout.width,
            height: cutout.height,
            boxShadow: `0 0 0 9999px ${VEIL}`,
          }}
        />
      )}

      {(cutout || closing) && (
        <div
          ref={cardRef}
          data-tour-card
          data-tour-step={step.id}
          className={cn(
            "pointer-events-auto fixed flex flex-col rounded-2xl border border-border bg-background p-4 text-foreground shadow-2xl",
            !reduceMotion &&
              "animate-in fade-in slide-in-from-bottom-1 duration-150",
          )}
          style={{
            left: cardLeft,
            top: cardTop,
            width: cardWidth,
            maxHeight: cardMaxHeight,
          }}
        >
          <div className="flex items-start gap-3">
            <div className="shrink-0">
              <Mascot pose={step.pose} className="size-20 sm:size-20" />
            </div>
            <div className="min-w-0 flex-1 pr-10">
              <h2
                id="onboarding-title"
                className="text-[15px] font-semibold leading-snug tracking-tight"
              >
                {step.title}
              </h2>
              <p aria-live="polite" className="mt-1 text-[13px] leading-snug">
                {step.quip}
              </p>
            </div>
          </div>
          <p className="mt-2 min-h-0 overflow-y-auto overscroll-contain text-[13px] leading-relaxed text-muted-foreground">
            {step.body}
          </p>
          <div className="mt-3 flex items-center justify-between gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setRect(null);
                setIndex((current) => Math.max(0, current - 1));
              }}
              disabled={index === 0}
            >
              Back
            </Button>
            <div
              role="progressbar"
              aria-label="Onboarding progress"
              aria-valuemin={1}
              aria-valuemax={STEPS.length}
              aria-valuenow={index + 1}
              className="flex items-center justify-center gap-1.5"
            >
              {STEPS.map((s, i) => (
                <span
                  key={s.id}
                  className={cn(
                    "h-1.5 rounded-full",
                    i === index
                      ? "w-5 bg-primary"
                      : "w-1.5 bg-muted-foreground/30",
                    !reduceMotion && "transition-all",
                  )}
                />
              ))}
            </div>
            <Button size="sm" onClick={advance}>
              {last ? "I'm ready" : "Next"}
            </Button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={finish}
            className="absolute top-2 right-2 h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            Skip
          </Button>
        </div>
      )}
    </div>
  );
}
