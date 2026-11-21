import type * as analysis from "../../bindings/mpesa-analyzer/internal/analysis/models";
import type * as parser from "../../bindings/mpesa-analyzer/internal/parser/models";
import { formatDay } from "@/lib/format";

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

export function addDays(day: string, days: number): string {
  const at = Date.parse(`${day}T00:00:00Z`);
  if (Number.isNaN(at)) return day;
  return new Date(at + days * 86_400_000).toISOString().slice(0, 10);
}

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

function isFeeRow(description: string): boolean {
  return description.includes("Charge") || description.startsWith("Fuliza Access Fee");
}
