import { useEffect, useMemo, useState } from "react";

import type * as analysis from "../../bindings/mpesa-analyzer/internal/analysis/models";
import type * as parser from "../../bindings/mpesa-analyzer/internal/parser/models";
import { AnalyzeTransactions } from "../../bindings/mpesa-analyzer/parseservice";
import { monthShort } from "@/lib/insight-finding";

/** The dataset-wide view: the same result the page already holds. */
export const ALL_MONTHS = "all";

export interface MonthOption {
  /** Calendar month, "YYYY-MM". */
  key: string;
  /** "Nov". */
  label: string;
  /** Money out for the month, signed cents (negative outflows). */
  out: number;
}

/**
 * The Insights month scope: "all" passes the page's dataset-wide result
 * through untouched; a month key filters transactions to that calendar
 * month and reruns the same analysis on the subset. Scoping is
 * frontend-only: tx.date is "YYYY-MM-DD HH:mm:ss", so the month bucket's
 * "YYYY-MM" prefix is the whole filter.
 */
export function useMonthScope({
  transactions,
  result,
  loading,
  error,
}: {
  transactions: parser.Transaction[];
  result: analysis.AnalysisResult | null;
  loading: boolean;
  error: string | null;
}) {
  const [selected, setSelected] = useState<string>(ALL_MONTHS);
  const [scoped, setScoped] = useState<analysis.AnalysisResult | null>(null);
  const [scopedLoading, setScopedLoading] = useState(false);
  const [scopedError, setScopedError] = useState<string | null>(null);

  // Newest first, capped to the newest twelve so the chip row stays one
  // scroll and never shows the same month name twice.
  const months = useMemo<MonthOption[]>(() => {
    const buckets = result?.cashflowMonthly ?? [];
    return buckets
      .slice(-12)
      .reverse()
      .map((b) => ({
        key: b.start.slice(0, 7),
        label: monthShort(b.start),
        out: b.out,
      }));
  }, [result]);

  useEffect(() => {
    if (selected === ALL_MONTHS) {
      setScoped(null);
      setScopedLoading(false);
      setScopedError(null);
      return;
    }
    const subset = transactions.filter((t) => t.date.slice(0, 7) === selected);
    if (subset.length === 0) {
      // The dataset changed under the selection and the month is gone;
      // fall back to the whole dataset rather than a skeleton forever.
      setSelected(ALL_MONTHS);
      return;
    }
    let cancelled = false;
    setScopedLoading(true);
    setScopedError(null);
    AnalyzeTransactions(subset)
      .then((r) => {
        if (!cancelled) setScoped(r);
      })
      .catch((e) => {
        if (!cancelled) setScopedError(String(e));
      })
      .finally(() => {
        if (!cancelled) setScopedLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected, transactions]);

  // Dropping the stale month's result up front keeps a fast A-to-B switch
  // on the skeleton instead of flashing A's figures under B.
  const select = (key: string) => {
    if (key === selected) return;
    setScoped(null);
    setSelected(key);
  };

  return {
    months,
    selected,
    select,
    result: selected === ALL_MONTHS ? result : scoped,
    loading: selected === ALL_MONTHS ? loading : scopedLoading,
    error: selected === ALL_MONTHS ? error : scopedError,
  };
}
