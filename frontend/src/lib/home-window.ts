import type * as analysis from "../../bindings/mpesa-analyzer/internal/analysis/models";
import type * as parser from "../../bindings/mpesa-analyzer/internal/parser/models";
import { formatDay } from "@/lib/format";

/** How many days the home's flow line summarizes. */
export const FLOW_WINDOW_DAYS = 30;

export type FlowWindow = {
  /** "YYYY-MM-DD", inclusive. */
  startDay: string;
  /** "YYYY-MM-DD", the dataset's newest transaction day. */
  endDay: string;
  /** Money in over the window, positive cents. */
  inCents: number;
  /** Money out over the window, positive cents. */
  outCents: number;
  /** M-Pesa fees over the window, positive cents. */
  feeCents: number;
};

/**
 * "YYYY-MM-DD" plus n days, still "YYYY-MM-DD". Window rules then stay
 * lexicographic string compares: days never become wall-clock Dates, because
 * imported statements are historical and local time zones would shift them.
 */
export function addDays(day: string, days: number): string {
  const at = Date.parse(`${day}T00:00:00Z`);
  if (Number.isNaN(at)) return day;
  return new Date(at + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * The hero's "as of" line, phrased relative to today. An absolute date on a
 * live wallet reads stale, so the last movement is "today", "yesterday" or a
 * plain day, whichever the reader's mind accepts fastest.
 */
export function updatedPhrase(endDay: string, today: string): string {
  if (endDay === today) return "today";
  if (endDay === addDays(today, -1)) return "yesterday";
  return formatDay(endDay);
}

type WindowSlice = {
  key: string;
  label: string;
  amount: number;
  count: number;
};

export type WindowSlices = {
  /** Built-in M-Pesa categories over the window. */
  standard: WindowSlice[];
  /** The user's own categories over the window, plus the unlabelled rest. */
  custom: WindowSlice[];
};

/**
 * Where the window's money went, in both category languages, so every figure
 * on the home describes the same stretch as the flow line and the weekly
 * bars. Outflows only, grouped over the Go-computed category each row
 * already carries; the custom view keeps unlabelled rows visible as one
 * grey bucket instead of hiding them.
 */
export function windowSlices(
  txs: {
    date: string;
    category: string;
    customCategoryId: string;
    customCategoryName: string;
    amount: number;
  }[],
  window: FlowWindow | null,
): WindowSlices {
  const out: WindowSlices = { standard: [], custom: [] };
  if (!window) return out;
  const inWindow = (day: string) => day >= window.startDay && day <= window.endDay;
  const standard = new Map<string, WindowSlice>();
  const custom = new Map<string, WindowSlice>();
  for (const t of txs) {
    if (t.amount >= 0) continue;
    const day = t.date.slice(0, 10);
    if (!inWindow(day)) continue;
    const std = standard.get(t.category) ?? {
      key: t.category,
      label: t.category,
      amount: 0,
      count: 0,
    };
    std.amount += t.amount;
    std.count += 1;
    standard.set(t.category, std);
    const id = t.customCategoryId || "";
    const cus = custom.get(id) ?? {
      key: id || "none",
      label: id ? t.customCategoryName : "Uncategorised",
      amount: 0,
      count: 0,
    };
    cus.amount += t.amount;
    cus.count += 1;
    custom.set(id, cus);
  }
  out.standard = [...standard.values()];
  out.custom = [...custom.values()];
  return out;
}

/**
 * The home's flow window: FLOW_WINDOW_DAYS days ending at the dataset's
 * newest transaction day, never at today. In and out come from the result's
 * daily cashflow buckets, which exclude fees by design; fees come from the
 * transactions themselves because the analysis carries no per-window fee
 * total. Returns null for an empty dataset.
 */
export function flowWindow(
  result: analysis.AnalysisResult | null,
  transactions: parser.Transaction[],
): FlowWindow | null {
  if (transactions.length === 0) return null;
  let endDay = "";
  for (const t of transactions) {
    const day = t.date.slice(0, 10);
    if (day > endDay) endDay = day;
  }
  const startDay = addDays(endDay, -(FLOW_WINDOW_DAYS - 1));
  const inWindow = (day: string) => day >= startDay && day <= endDay;

  let inCents = 0;
  let outCents = 0;
  const buckets = result?.cashflowDaily ?? [];
  if (buckets.length > 0) {
    for (const b of buckets) {
      if (!inWindow(b.start)) continue;
      inCents += b.in;
      outCents += b.out;
    }
  } else {
    // No daily buckets at the bridge: fall back to the same rule per
    // transaction so the flow line never silently reads zero.
    for (const t of transactions) {
      if (!inWindow(t.date.slice(0, 10)) || isFeeRow(t.description)) continue;
      if (t.amount >= 0) inCents += t.amount;
      else outCents += -t.amount;
    }
  }

  let feeCents = 0;
  for (const t of transactions) {
    if (!inWindow(t.date.slice(0, 10)) || !isFeeRow(t.description)) continue;
    feeCents += -t.amount;
  }

  return { startDay, endDay, inCents, outCents, feeCents };
}

/**
 * Fee rows are statements' own charge lines, not spending. This mirrors
 * internal/analysis/total.go isFee (a "Charge" row, or the SMS Fuliza access
 * fee that carries no "Charge" word) so the home's fee figure matches what
 * Insights and the totals report; a frontend reimplementation that drifts
 * would put two different fee numbers in one app.
 */
function isFeeRow(description: string): boolean {
  return description.includes("Charge") || description.startsWith("Fuliza Access Fee");
}
