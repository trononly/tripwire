import type * as analysis from "../../bindings/mpesa-analyzer/internal/analysis/models";

/**
 * The Insights opening finding, computed from the analysis result the page
 * already holds. Pure functions: no React, no fetching, no invented
 * numbers - every figure traces back to AnalysisResult (and `now`, passed
 * in so "so far" stays testable).
 */

export interface InsightLead {
  /** Category name as the analysis reports it, e.g. "Rent". */
  category: string;
  /** Share of all money out, per hundred: "36", or "under 1" when the
   * rounded share would read as zero while real spending exists. */
  perHundred: string;
  /** "since September" when the dataset spans months, "in November" when
   * it covers one. */
  scope: string;
}

/** One month-over-month money-out line, or nothing when there is no
 * honest comparison (one month of data). */
export type InsightDelta =
  | {
      kind: "changed";
      /** true = the good direction (money out shrank). */
      good: boolean;
      /** "November so far" when the newest bucket is the current month,
       * else "October". */
      subject: string;
      /** Absolute change, e.g. "23,557.50". */
      amount: string;
      against: string;
    }
  | { kind: "flat"; subject: string; against: string };

export interface InsightFinding {
  lead: InsightLead | null;
  delta: InsightDelta | null;
}

const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

function monthIndex(start: string): number {
  const m = Number(start.slice(5, 7));
  return m >= 1 && m <= 12 ? m - 1 : 0;
}

export function monthShort(start: string): string {
  return MONTHS_SHORT[monthIndex(start)];
}

function monthLongName(start: string): string {
  return MONTHS_LONG[monthIndex(start)];
}

function isCurrentMonth(start: string, now: Date): boolean {
  const ym = start.slice(0, 7);
  const y = String(now.getFullYear());
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return ym === `${y}-${m}`;
}

/** Grouped whole-shilling figure without a currency code, for narrative
 * lines where the screen context already says money: "23,557.50". */
function plainMoney(cents: number): string {
  return new Intl.NumberFormat("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(cents) / 100);
}

/** Grouped figure without decimals, for tight cells: "63,566". */
function shortMoney(cents: number): string {
  return new Intl.NumberFormat("en-KE", { maximumFractionDigits: 0 }).format(
    Math.abs(cents) / 100,
  );
}

/** The lead finding: the biggest category's share of all money out. */
function insightLead(result: analysis.AnalysisResult): InsightLead | null {
  const months = result.cashflowMonthly ?? [];
  const totalOut = result.totals.totalOut;
  if (totalOut <= 0) return null;
  // Category amounts are signed cents, outflows negative; pick the
  // largest spending category.
  const biggest = (result.categories ?? []).reduce<
    analysis.CategoryTotal | null
  >((best, c) => (c.amount < 0 && (best === null || c.amount < best.amount) ? c : best), null);
  if (!biggest) return null;
  const share = Math.round((Math.abs(biggest.amount) / totalOut) * 100);
  const first = months[0]?.start;
  const scope =
    months.length > 1 && first
      ? `since ${monthLongName(first)}`
      : first
        ? `in ${monthLongName(first)}`
        : "";
  return {
    category: biggest.name,
    perHundred: share >= 1 ? String(share) : "under 1",
    scope,
  };
}

/** The month-over-month money-out delta from the monthly buckets. */
function insightDelta(
  result: analysis.AnalysisResult,
  now: Date,
): InsightDelta | null {
  const months = result.cashflowMonthly ?? [];
  const prev = months[months.length - 2];
  const last = months[months.length - 1];
  if (!prev || !last) return null;
  const subject = isCurrentMonth(last.start, now)
    ? `${monthLongName(last.start)} so far`
    : monthLongName(last.start);
  const against = monthLongName(prev.start);
  const diff = last.out - prev.out;
  if (diff === 0) return { kind: "flat", subject, against };
  return {
    kind: "changed",
    // Less money out is the good direction.
    good: diff < 0,
    subject,
    amount: plainMoney(diff),
    against,
  };
}

export function insightFinding(
  result: analysis.AnalysisResult | null,
  now: Date = new Date(),
): InsightFinding {
  if (!result) return { lead: null, delta: null };
  return { lead: insightLead(result), delta: insightDelta(result, now) };
}

export interface MonthOutCell {
  /** Grouped money out without decimals: "63,566". */
  value: string;
  /** "Nov", or "Nov, to date" for the current month. */
  label: string;
}

/** The newest (up to) three monthly money-out buckets, oldest first. */
export function monthOutCells(
  result: analysis.AnalysisResult | null,
  now: Date = new Date(),
): MonthOutCell[] {
  const months = result?.cashflowMonthly ?? [];
  return months.slice(-3).map((b) => ({
    value: shortMoney(b.out),
    label: isCurrentMonth(b.start, now)
      ? `${monthShort(b.start)}, to date`
      : monthShort(b.start),
  }));
}

/** "Sep to Nov" for the fee card header; a lone month reads "November". */
export function feeRangeLabel(
  result: analysis.AnalysisResult | null,
): string | null {
  const months = result?.cashflowMonthly ?? [];
  if (months.length === 0) return null;
  const first = monthShort(months[0].start);
  const last = monthShort(months[months.length - 1].start);
  return months.length > 1 ? `${first} to ${last}` : monthLongName(months[0].start);
}
