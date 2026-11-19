import { Link } from "react-router-dom";
import { useMemo } from "react";
import { FileUp, Lightbulb } from "lucide-react";
import type * as analysis from "../../bindings/mpesa-analyzer/internal/analysis/models";
import type * as parser from "../../bindings/mpesa-analyzer/internal/parser/models";
import type * as store from "../../bindings/mpesa-analyzer/internal/store/models";

import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RecurringPayments } from "@/components/recurring-payments";
import { usePlanReminders } from "@/hooks/use-plan-reminders";
import { useRecurringPlans } from "@/hooks/use-recurring-plans";
import {
  lastPaidOf,
  toPlanLike,
  type LastPaid,
  type PlanDraft,
} from "@/lib/recurring-plans";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  feeRangeLabel,
  insightFinding,
  monthOutCells,
  type InsightFinding,
  type MonthOutCell,
} from "@/lib/insight-finding";

/**
 * Insights - the depth layer on top of the same analysis result the
 * Dashboard uses. The screen opens with the finding in words, then the
 * cards that back it up. Every figure reads from AnalysisResult; a card
 * with no underlying data yet shows an honest empty state, never invented
 * numbers.
 */

function TileEmpty({ children }: { children: React.ReactNode }) {
  return (
    <CardContent className="pt-0">
      <p className="border border-dashed p-4 text-sm text-muted-foreground">
        {children}
      </p>
    </CardContent>
  );
}

/** The finding, in words: the biggest category's share of money out, then
 * the month-over-month delta. Colours follow the direction, grey when
 * there is nothing to compare. */
function FindingCard({ finding }: { finding: InsightFinding }) {
  const { lead, delta } = finding;
  if (!lead && !delta) return null;
  return (
    <Card>
      <CardContent className="space-y-2">
        {lead && (
          <p className="text-[15px] font-medium leading-snug">
            {lead.category} took{" "}
            <span className="num text-[22px] font-semibold">
              {lead.perHundred}%
            </span>{" "}
            of everything you spent{lead.scope ? ` ${lead.scope}` : ""}.
          </p>
        )}
        {delta?.kind === "changed" && (
          <p className="text-[13px] text-muted-foreground">
            {delta.subject} is{" "}
            <span
              className={cn(
                "num font-medium",
                delta.good ? "text-money-in" : "text-money-out",
              )}
            >
              {delta.amount}
            </span>{" "}
            {delta.good ? "lighter" : "heavier"} than {delta.against}.
          </p>
        )}
        {delta?.kind === "flat" && (
          <p className="text-[13px] text-muted-foreground">
            {delta.subject} matches {delta.against}.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** Fee radar: what Safaricom took, straight from the Fees category and the
 * totals the analyzer already computes, split by fee kind so the Fuliza
 * access-fee part is visible on its own row. */
function FeeRadarCard({ result }: { result: analysis.AnalysisResult }) {
  const totalFees = result.totals.totalFees;
  const byType = result.feesByType ?? [];
  const fulizaOwed = result.fulizaOutstanding;

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Fees Safaricom took</CardTitle>
        <CardAction className="text-[12px] text-muted-foreground">
          {feeRangeLabel(result)}
        </CardAction>
      </CardHeader>
      {byType.length === 0 && totalFees === 0 ? (
        <TileEmpty>No fee transactions in this dataset yet.</TileEmpty>
      ) : (
        <CardContent className="pt-0">
          <div className="divide-y divide-border/60">
            {byType.map((f) => (
              <div
                key={f.key}
                className="flex items-baseline justify-between gap-2 py-1.5 text-sm"
              >
                <span className="text-muted-foreground">
                  {f.label} · {f.count}
                </span>
                <span className="num font-medium">{formatMoney(f.amount)}</span>
              </div>
            ))}
            <div className="flex items-baseline justify-between gap-2 py-1.5 text-sm">
              <span>Total</span>
              <span className="num font-semibold">
                {formatMoney(totalFees)}
              </span>
            </div>
            {fulizaOwed > 0 && (
              <div className="flex items-baseline justify-between gap-2 py-1.5 text-sm">
                <span className="text-muted-foreground">Fuliza owed</span>
                <span className="num font-medium">
                  {formatMoney(fulizaOwed)}
                </span>
              </div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

/** Money out by month: the newest three buckets as plain cells. */
function MonthOutCard({ cells }: { cells: MonthOutCell[] }) {
  if (cells.length === 0) return null;
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Money out by month</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-3 gap-3 pt-1">
          {cells.map((c) => (
            <div key={c.label}>
              <p className="num text-xl font-semibold">{c.value}</p>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                {c.label}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function Insights({
  transactions,
  result,
  loading,
  error,
  simKey,
}: {
  transactions: parser.Transaction[];
  result: analysis.AnalysisResult | null;
  loading: boolean;
  error: string | null;
  /** Header wallet SIM, for the Play button's dial. */
  simKey?: string | null;
}) {
  const {
    plans,
    loading: plansLoading,
    add,
    update,
    remove,
    setSkipped,
  } = useRecurringPlans();
  const lastPaid = useMemo(() => {
    const out: Record<string, LastPaid | null> = {};
    for (const plan of plans) out[plan.id] = lastPaidOf(toPlanLike(plan), transactions);
    return out;
  }, [plans, transactions]);

  usePlanReminders(plans, lastPaid, plansLoading);

  const savePlan = async (draft: PlanDraft, id: string | null) => {
    if (id) return update(id, draft);
    return add(draft);
  };

  const finding = useMemo(() => insightFinding(result), [result]);
  const cells = useMemo(() => monthOutCells(result), [result]);

  if (transactions.length === 0) {
    return (
      <div className="space-y-6">
        <Card className="flex min-h-72 items-center justify-center">
          <CardContent className="flex max-w-sm flex-col items-center gap-4 pt-2 text-center">
            <Lightbulb className="size-8 text-muted-foreground" />
            <p className="text-lg font-medium">No data to analyze yet</p>
            <p className="text-sm text-muted-foreground">
              Import a statement to see recurring payments and fees.
            </p>
            <Button asChild size="lg">
              <Link to="/">
                <FileUp />
                Go to Dashboard
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-4 text-sm text-destructive">
            {error}
          </CardContent>
        </Card>
      )}

      {loading || !result ? (
        <div className="space-y-5">
          <Skeleton className="h-28 rounded-none" />
          <Skeleton className="h-64 rounded-none" />
          <div className="grid gap-4 lg:grid-cols-2">
            <Skeleton className="h-40 rounded-none" />
            <Skeleton className="h-40 rounded-none" />
          </div>
        </div>
      ) : (
        <div className="space-y-5">
      <FindingCard finding={finding} />
          <RecurringPayments
            plans={plans}
            lastPaid={lastPaid}
            loading={plansLoading}
            simKey={simKey}
            onSavePlan={savePlan}
            onDeletePlan={remove}
            onSkipPlan={setSkipped}
          />
          <div className="grid items-stretch gap-4 lg:grid-cols-2">
            <FeeRadarCard result={result} />
            <MonthOutCard cells={cells} />
          </div>
        </div>
      )}
    </div>
  );
}
