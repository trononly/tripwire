/**
 * The tour's step registry. Every step carries a stable id, so the seen set
 * can tell a new feature's step from one this user already met. A new pass
 * adds steps here with its own `pass` label; the store shows only the ids it
 * has not seen.
 */

/** The mascot's expression for a step. */
export type Pose = "wave" | "point" | "smug" | "flustered" | "proud";

/** The element a step lights up: hooks the app already renders, no new ones. */
export type StepTarget = {
  /** CSS selector for the target, using hooks the app already renders. */
  selector: string;
  /** Disambiguates a selector that matches several elements (card titles). */
  text?: string;
  /** Measures this ancestor instead of the matched hook, e.g. the whole card. */
  closest?: string;
};

export type TourStep = {
  /** Stable across releases. Changing it makes the step unseen again. */
  id: string;
  /** Groups steps into a pass, e.g. "first-run" or a feature date. */
  pass?: string;
  title: string;
  /** One plain line that adds a fact the body does not. Empty when folded. */
  quip: string;
  body: string;
  /** Copy for builds without the Android bridge, where payments run on a phone. */
  desktopBody?: string;
  pose: Pose;
  /** Hash route the app must be on before the target exists. */
  route: string;
  /** Null for a closing card with nothing on the app to point at. */
  target: StepTarget | null;
};

const PAY_DESTINATIONS =
  "send money, Pochi la Biashara, pay bill and buy goods";
const PAY_PIN =
  "Tripwire never sees or stores your PIN. You enter it in the phone's own USSD dialog.";

export const STEPS: readonly TourStep[] = [
  {
    id: "core.balance",
    pass: "first-run",
    title: "Your balance",
    quip: "In and out cover the last 30 days.",
    body: "The balance shows your money right now. With no statement active, this card opens your history.",
    pose: "point",
    route: "/",
    target: { selector: 'main [data-slot="card"]' },
  },
  {
    id: "core.pay",
    pass: "first-run",
    title: "Paying someone",
    quip: "",
    // The payment flow is the one place automation matters, so this single
    // step owns its explanation and names it only where the bridge exists.
    body: `Pay opens four destinations: ${PAY_DESTINATIONS}. Choosing one asks for the amount, then the USSD dialog appears with its menus filled through the accessibility automation. ${PAY_PIN}`,
    desktopBody: `Pay opens four destinations: ${PAY_DESTINATIONS}. Choosing one asks for the amount. The guided USSD dialog runs in the Android app, where the accessibility automation fills the menus. ${PAY_PIN}`,
    pose: "smug",
    route: "/",
    target: { selector: 'nav button[aria-label="Pay"]' },
  },
  {
    id: "core.breakdown",
    pass: "first-run",
    title: "Where the money went",
    quip: "A category opens its transactions.",
    body: "The ring groups the last 30 days by category.",
    pose: "smug",
    route: "/",
    target: {
      selector: 'main svg[aria-label^="Spending by category"]',
      closest: '[data-slot="card"]',
    },
  },
  {
    id: "core.coming-up",
    pass: "first-run",
    title: "What is coming up",
    quip: "",
    body: "Coming up lists repeating payments and their next date. A payment can be paid now, skipped for a cycle, or edited.",
    pose: "flustered",
    route: "/",
    target: {
      selector: 'main [data-slot="card"]',
      text: "Coming up",
    },
  },
  {
    id: "core.history",
    pass: "first-run",
    title: "Your statement history",
    quip: "",
    body: "The top-bar chip opens your statement history. Switch the active statement, import a new PDF statement or delete an old one.",
    pose: "proud",
    route: "/",
    target: {
      selector: "header button:has(svg.lucide-chevron-down)",
    },
  },
  {
    id: "core.ledger",
    pass: "first-run",
    title: "The ledger",
    quip: "",
    body: "A transaction opens its full receipt. The icon on the left sets its category.",
    pose: "point",
    route: "/transactions",
    target: {
      selector:
        'main section button[aria-label^="Set category"] + button, main section button[aria-label^="Change category"] + button',
    },
  },
  {
    id: "core.filters",
    pass: "first-run",
    title: "Filters and search",
    quip: "",
    body: "Search matches the description, category or counterparty. Filters narrow the list by category, direction or date.",
    pose: "point",
    route: "/transactions",
    target: {
      selector: "main button:has(svg.lucide-sliders-horizontal)",
    },
  },
  {
    id: "core.insights",
    pass: "first-run",
    title: "Insights by month",
    quip: "",
    body: "The month picker scopes the page to one month. All activity shows the whole history.",
    pose: "flustered",
    route: "/insights",
    target: {
      selector: 'main button[aria-haspopup="dialog"]',
      text: "activity",
    },
  },
  {
    id: "core.privacy",
    pass: "first-run",
    title: "Privacy mode",
    quip: "",
    body: "The eye blurs every figure. A blurred figure shows its value when tapped, and the eye turns the mode off again.",
    pose: "proud",
    route: "/",
    target: {
      selector: 'header button[aria-label*="Privacy Mode"]',
    },
  },
  {
    id: "core.notifications",
    pass: "first-run",
    title: "One last thing",
    quip: "",
    body: "Notifications let Tripwire warn you before a repeating bill is due. Declining changes nothing else.",
    pose: "proud",
    route: "/",
    target: null,
  },
];
