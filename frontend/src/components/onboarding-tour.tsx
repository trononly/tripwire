import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { useReduceMotionEnabled } from "@/lib/motion-settings";
import { markDone, useOnboardingState } from "@/lib/onboarding-state";
import { cn } from "@/lib/utils";

type Pose = "wave" | "point" | "smug" | "flustered" | "proud";

type TourStep = {
  id: string;
  title: string;
  /** One line in the teacher's voice. The lesson stays in `body`. */
  quip: string;
  body: string;
  pose: Pose;
};

const STEPS: readonly TourStep[] = [
  {
    id: "welcome",
    title: "Tripwire reads your M-Pesa",
    quip: "I went through your messages so you don't have to. You're welcome.",
    body: "Statements and SMS become one history of balance, spending, fees and repeating bills.",
    pose: "wave",
  },
  {
    id: "import",
    title: "Start with a statement",
    quip: "The history icon. Top bar. It was right there the whole time.",
    body: "Tap it, choose Import statement, then pick your M-Pesa PDF. SMS import sits on the SMS page.",
    pose: "point",
  },
  {
    id: "pay",
    title: "Pay without hunting menus",
    quip: "The Pay button. In the bar. Where your thumb already lives.",
    body: "Four destinations: send, Pochi, paybills and tills. Tripwire fills the menu and stops at your PIN.",
    pose: "smug",
  },
  {
    id: "home",
    title: "Home answers four questions",
    quip: "Four cards. Reading them is cheaper than wondering.",
    body: "Balance, weekly spending, the breakdown, what's next. Tap a slice to see its transactions.",
    pose: "point",
  },
  {
    id: "insights",
    title: "Insights pick a month",
    quip: "Yes, that month. Pick another one if you must.",
    body: "The month picker scopes the page: biggest finding, fees, who paid you most, recurring bills.",
    pose: "flustered",
  },
  {
    id: "privacy",
    title: "Keep the numbers to yourself",
    quip: "Someone is reading over your shoulder. I'll handle it.",
    body: "The eye in the top bar blurs every figure until you tap it. Turn it off the same way.",
    pose: "proud",
  },
];

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
function Mascot({ pose }: { pose: Pose }) {
  return (
    <svg viewBox="0 0 120 120" aria-hidden="true" className="size-28 sm:size-32">
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
 * `restart()` from developer tools reopens it without a relaunch.
 */
export function OnboardingTour() {
  const { done } = useOnboardingState();
  const reduceMotion = useReduceMotionEnabled();
  const [index, setIndex] = useState(0);
  const step = STEPS[Math.min(index, STEPS.length - 1)];
  const last = index === STEPS.length - 1;

  // The overlay covers the whole viewport, so lock the page behind it: a
  // swipe must not scroll the dashboard under the tour.
  useEffect(() => {
    if (done) return;
    const { body } = document;
    const previous = body.style.overflow;
    body.style.overflow = "hidden";
    return () => {
      body.style.overflow = previous;
    };
  }, [done]);

  if (done) return null;

  function finish() {
    setIndex(0);
    markDone();
  }

  function next() {
    if (last) finish();
    else setIndex((current) => current + 1);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      className="fixed inset-0 z-[100] flex flex-col bg-background"
    >
      <div style={{ height: "var(--safe-top,env(safe-area-inset-top))" }} />
      <div className="flex justify-end px-4 pt-2">
        <Button variant="ghost" size="sm" onClick={finish}>
          Skip
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto overscroll-contain px-6 py-4">
        <div aria-live="polite" className="w-full max-w-sm">
          <div
            key={step.id}
            className={cn(
              "flex flex-col items-center text-center",
              !reduceMotion &&
                "animate-in fade-in slide-in-from-bottom-2 duration-200",
            )}
          >
            <Mascot pose={step.pose} />
            <h2
              id="onboarding-title"
              className="mt-4 text-xl font-semibold tracking-tight"
            >
              {step.title}
            </h2>
            <p className="mt-2 text-[13px] leading-snug text-foreground">
              {step.quip}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {step.body}
            </p>
          </div>
        </div>
      </div>

      <div className="px-6 pb-[calc(1.5rem+var(--safe-bottom,env(safe-area-inset-bottom)))]">
        <div className="mx-auto w-full max-w-sm">
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
                  i === index ? "w-5 bg-primary" : "w-1.5 bg-muted-foreground/30",
                  !reduceMotion && "transition-all",
                )}
              />
            ))}
          </div>
          <div className="mt-5 flex items-center justify-between gap-3">
            <Button
              variant="ghost"
              onClick={() => setIndex((current) => Math.max(0, current - 1))}
              disabled={index === 0}
            >
              Back
            </Button>
            <Button onClick={next}>{last ? "I'm ready" : "Next"}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
