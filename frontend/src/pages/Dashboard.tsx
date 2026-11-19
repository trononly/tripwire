import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  XAxis,
  YAxis,
} from "recharts";
import { FileUp, MessageSquareText, Tags } from "lucide-react";
import type * as analysis from "../../bindings/mpesa-analyzer/internal/analysis/models";
import type * as parser from "../../bindings/mpesa-analyzer/internal/parser/models";

import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  CategoryBreakdown,
  type SpendSlice,
} from "@/components/charts/category-breakdown";
import { Private } from "@/components/privacy";
import { maxDayOf } from "@/lib/date-window";
import { useDonutMode } from "@/lib/donut-mode";
import { useRecurringPlans } from "@/hooks/use-recurring-plans";
import {
  useReduceMotionEnabled,
  vibrateIfEnabled,
} from "@/lib/motion-settings";
import { useInView } from "@/hooks/use-in-view";
import { cn } from "@/lib/utils";
import { formatBucketLabel, formatDay, formatMoney } from "@/lib/format";
import { addDays, flowWindow, windowSlices } from "@/lib/home-window";
import { dueLabel, nextDue, toPlanLike } from "@/lib/recurring-plans";
import {
  useTransactionGroups,
  type TransactionView,
} from "@/components/transaction-list";

/**
 * Home - "how am I doing?" in five cards: the balance and its recent flow,
 * the heaviest week, where money went, what is coming up, and what just
 * happened. Payment controls live behind the Pay button, not here.
 */

/** Signed shillings, "-1,200.00". The currency prefix is the hero's job. */
function amount(cents: number): string {
  return (Math.abs(cents) / 100).toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Whole shillings for the quiet flow line: "122,734". Cents are ledger
 * detail, not glance detail. */
function whole(cents: number): string {
  return new Intl.NumberFormat("en-KE", { maximumFractionDigits: 0 }).format(
    Math.abs(cents) / 100,
  );
}

/** "KES 62,978.00" -> ["KES 62,978", "00"]; the cents render smaller. */
function balanceParts(cents: number): [string, string | null] {
  const [whole, frac] = formatMoney(cents).split(".");
  return frac ? [whole, frac] : [whole, null];
}

// ---------------------------------------------------------------------------
// Money out by week
// ---------------------------------------------------------------------------

type WeekOut = {
  /** Display label for the week's Monday, "3 Nov". */
  label: string;
  /** Money out for the week, shillings. */
  out: number;
  /** The recurring payment that caused the heaviest week, or null. */
  cause: string | null;
};

const WEEKS_SHOWN = 5;

const weekConfig = {
  out: { label: "Money out", color: "var(--chart-1)" },
} satisfies ChartConfig;

function WeekOutChart({ weeks }: { weeks: WeekOut[] }) {
  const reduceMotion = useReduceMotionEnabled();
  const { ref, inView } = useInView<HTMLDivElement>({ once: true });
  const animate = !reduceMotion && inView;
  const peak = weeks.reduce(
    (best, w, i) => (w.out > weeks[best].out ? i : best),
    0,
  );
  const cause = weeks[peak]?.cause ?? null;
  const heaviest =
    cause !== null && cause.length > 20 ? `${cause.slice(0, 19)}…` : cause;

  return (
    <div ref={ref}>
      <ChartContainer
        config={weekConfig}
        className="h-[170px] w-full"
        role="img"
        aria-label={
          heaviest
            ? `Weekly money out, the week of ${weeks[peak].label} is the heaviest, ${heaviest}`
            : "Weekly money out"
        }
      >
        <BarChart
          key={animate ? "live" : "static"}
          data={weeks}
          barCategoryGap="24%"
          margin={{ left: 4, right: 8, top: 20 }}
        >
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tickMargin={6}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
          />
          {/* The y axis stays implicit: three ticks drive three faint
              gridlines, no numbers, the bar heights carry the scale. */}
          <YAxis hide domain={[0, "dataMax"]} tickCount={3} />
          <ChartTooltip
            cursor={{ fill: "var(--muted)", opacity: 0.4 }}
            content={
              <ChartTooltipContent
                formatter={(value) => (
                  <span className="tabular-nums">
                    {formatMoney(Number(value) * 100)}
                  </span>
                )}
              />
            }
          />
          <Bar
            dataKey="out"
            fill="var(--color-out)"
            radius={0}
            maxBarSize={36}
            isAnimationActive={animate}
            animationDuration={700}
            animationEasing="ease-out"
          >
            {/* The heaviest week names its cause once, always visible:
                touch has no hover to hide a label behind. */}
            <LabelList
              dataKey="out"
              content={(props: { viewBox?: unknown; index?: number }) => {
                if (!heaviest || props.index !== peak) return null;
                // Bar labels arrive with a cartesian trapezoid view box;
                // the cast keeps the polar shape out of the types.
                const box = props.viewBox as {
                  x?: number;
                  y?: number;
                  width?: number;
                } | null;
                const x = box?.x;
                const y = box?.y;
                if (x === undefined || y === undefined) return null;
                return (
                  <text
                    x={x + (box?.width ?? 0) / 2}
                    y={y - 6}
                    textAnchor="middle"
                    fill="var(--muted-foreground)"
                    fontSize={12}
                  >
                    {heaviest}
                  </text>
                );
              }}
            />
          </Bar>
        </BarChart>
      </ChartContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Where it went: top slices plus one rest bucket
// ---------------------------------------------------------------------------

const TOP_SLICES = 3;
const REST_KEY = "everything-else";

function topSlicesWithRest(slices: SpendSlice[]): SpendSlice[] {
  const spend = slices
    .filter((s) => s.amount < 0)
    .sort((a, b) => a.amount - b.amount);
  if (spend.length <= TOP_SLICES) return spend;
  const top = spend.slice(0, TOP_SLICES);
  const rest = spend.slice(TOP_SLICES);
  return [
    ...top,
    {
      key: REST_KEY,
      label: "Everything else",
      amount: rest.reduce((n, s) => n + s.amount, 0),
      count: rest.reduce((n, s) => n + s.count, 0),
    },
  ];
}

// ---------------------------------------------------------------------------
// Coming up
// ---------------------------------------------------------------------------

const UPCOMING_SHOWN = 4;

const cadenceLabels: Record<string, string> = {
  weekly: "Weekly",
  "bi-weekly": "Bi-weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
};

// ---------------------------------------------------------------------------
// The five cards, one analyzed dataset
// ---------------------------------------------------------------------------

function HomeCards({
  result,
  transactions,
  latestDay,
}: {
  result: analysis.AnalysisResult;
  transactions: parser.Transaction[];
  latestDay: string;
}) {
  const navigate = useNavigate();
  const [donutMode, setDonutMode] = useDonutMode();
  const { plans } = useRecurringPlans();
  const groups = useTransactionGroups(transactions);
  const flow = flowWindow(result, transactions);

  // Every figure on this page describes the same window: the flow line, the
  // weekly bars and the donut all speak for the last 30 days of the dataset,
  // so no card can quietly disagree with another.
  const windowed = useMemo(
    () => windowSlices(groups.flatMap((g) => g.txs), flow),
    [groups, flow],
  );
  const builtInSlices = windowed.standard;
  const customSlices = windowed.custom;
  const hasCustomSpend = customSlices.some((s) => s.amount < 0);
  const trimmedSlices = useMemo(
    () =>
      topSlicesWithRest(
        donutMode === "custom" ? customSlices : builtInSlices,
      ),
    [donutMode, windowed],
  );

  // Weeks are the dataset's own weekly buckets, newest five; the cause is
  // the largest recurring payment whose last payment day falls in that week.
  const weeks: WeekOut[] = useMemo(() => {
    const list = (result.cashflowWeekly ?? []).slice(-WEEKS_SHOWN);
    const recurring = result.recurringPayments ?? [];
    return list.map((w) => {
      const weekEnd = addDays(w.start, 6);
      let cause: string | null = null;
      let best = 0;
      for (const p of recurring) {
        const day = p.lastDate.slice(0, 10);
        if (day < w.start || day > weekEnd) continue;
        if (p.amount > best) {
          best = p.amount;
          cause = p.counterparty;
        }
      }
      return {
        label: formatBucketLabel(w.label),
        out: w.out / 100,
        cause,
      };
    });
  }, [result]);

  const upcoming = useMemo(() => {
    const today = new Date();
    return plans
      .map((plan) => ({ plan, due: nextDue(toPlanLike(plan), today) }))
      .filter(({ due }) => !Number.isNaN(due.getTime()))
      .sort((a, b) => a.due.getTime() - b.due.getTime())
      .slice(0, UPCOMING_SHOWN);
  }, [plans]);

  return (
    <>
      {flow && (
        <Private label="Tap to reveal the balance">
          <Card>
            <CardHeader>
              <CardTitle className="text-[13px] font-medium text-muted-foreground">
                Balance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="num text-[34px] font-semibold leading-none tracking-tight">
                {(() => {
                  const [whole, cents] = balanceParts(
                    result.totals.closingBalance,
                  );
                  return (
                    <>
                      {whole}
                      {cents && (
                        <span className="text-[18px] font-medium text-muted-foreground">
                          .{cents}
                        </span>
                      )}
                    </>
                  );
                })()}
              </p>
              <p className="num mt-1.5 text-[13px] text-muted-foreground">
                <span className="font-medium text-money-in">
                  In {whole(flow.inCents)}
                </span>
                {" · "}
                <span className="font-medium text-money-out">
                  Out {whole(flow.outCents)}
                </span>
                {" · "}
                <span>fees {whole(flow.feeCents)}</span>
              </p>
            </CardContent>
          </Card>
        </Private>
      )}

      {weeks.length > 0 && (
        <Private label="Tap to reveal weekly spending">
          <Card>
            <CardHeader>
              <CardTitle className="text-[13px] font-medium text-muted-foreground">
                Money out by week
              </CardTitle>
              <CardAction className="text-[12px] font-normal text-muted-foreground">
                last 5 weeks
              </CardAction>
            </CardHeader>
            <CardContent>
              <WeekOutChart weeks={weeks} />
            </CardContent>
          </Card>
        </Private>
      )}

      <Private label="Tap to reveal the spending breakdown">
        <CategoryBreakdown
          slices={trimmedSlices}
          description={builtInSlices.length > 0 ? "last 30 days" : undefined}
          onSelectSlice={(key) =>
            key === REST_KEY
              ? navigate("/transactions")
              : navigate(
                  donutMode === "custom"
                    ? `/transactions?custom=${encodeURIComponent(key)}`
                    : `/transactions?category=${encodeURIComponent(key)}`,
                )
          }
          toolbar={
            <div className="flex gap-1" role="group" aria-label="Category view">
              {(
                [
                  { key: "mpesa", label: "Standard" },
                  { key: "custom", label: "Custom" },
                ] as const
              ).map((option) => (
                <button
                  key={option.key}
                  type="button"
                  aria-pressed={donutMode === option.key}
                  className={cn(
                    "tile",
                    donutMode === option.key && "tile-active",
                  )}
                  onClick={() => {
                    vibrateIfEnabled(8);
                    setDonutMode(option.key);
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          }
          footer={
            donutMode === "custom" ? (
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 w-full justify-center gap-1.5 text-xs text-muted-foreground"
                onClick={() => navigate("/categories")}
              >
                <Tags className="size-3.5" />
                Manage categories
              </Button>
            ) : undefined
          }
          empty={
            donutMode === "custom" && !hasCustomSpend ? (
              <div className="flex min-h-56 flex-col items-center justify-center gap-2 px-4 text-center">
                <Tags className="size-6 text-muted-foreground" />
                <p className="text-sm font-medium">Nothing labelled yet</p>
                <p className="text-xs text-muted-foreground">
                  Tap a transaction&rsquo;s icon to give it a category; it
                  shows up here.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate("/transactions")}
                >
                  Label transactions
                </Button>
              </div>
            ) : undefined
          }
        />
      </Private>

      {upcoming.length > 0 && (
        <Private label="Tap to reveal upcoming payments">
          <Card>
            <CardHeader>
              <CardTitle className="text-[13px] font-medium text-muted-foreground">
                Coming up
              </CardTitle>
              <CardAction className="text-[12px] font-normal text-muted-foreground">
                your plans
              </CardAction>
            </CardHeader>
            <CardContent>
              <div className="divide-y divide-border/70">
                {upcoming.map(({ plan, due }) => (
                  <div
                    key={plan.id}
                    className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-medium" title={plan.name}>
                        {plan.name}
                      </p>
                      <p className="text-[12px] text-muted-foreground">
                        {cadenceLabels[plan.cadence] ?? plan.cadence}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[12px] text-muted-foreground">
                        {dueLabel(due)}
                      </p>
                      {plan.amount > 0 && (
                        <p className="num text-[14px] font-medium">
                          {amount(plan.amount)}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </Private>
      )}

    </>
  );
}

// ---------------------------------------------------------------------------
// Page shell: states, then the cards
// ---------------------------------------------------------------------------

export default function Dashboard({
  transactions,
  result,
  loading,
  error,
  historyCount,
  smsMode = false,
  onImport,
  onImportSms,
  importing = false,
  booting = false,
  onBrowseHistory,
}: {
  transactions: parser.Transaction[];
  result: analysis.AnalysisResult | null;
  loading: boolean;
  error: string | null;
  historyCount: number;
  /** True while the app analyzes the SMS dataset (Android). */
  smsMode?: boolean;
  onImport: () => void;
  /** Android only: open the SMS import straight away (asks for SMS access
   * on the spot instead of routing through the SMS page). */
  onImportSms: () => void;
  /** True while an SMS import is in flight: show skeletons, not buttons. */
  importing?: boolean;
  /** True until the launch-time history read settles: an empty list then
   * means "not loaded yet", so the empty state must wait. */
  booting?: boolean;
  onBrowseHistory: () => void;
}) {
  const latestDay = maxDayOf(transactions.map((t) => t.date));

  // The result stays on screen through a re-analysis, so the cards are not
  // torn down and re-animated when the dataset is refreshed.
  const lastGood = useRef<analysis.AnalysisResult | null>(null);
  if (result) lastGood.current = result;
  const visible = result ?? lastGood.current;
  const updating = visible !== null && loading;

  // Transactions loaded but the first analysis has not landed: render the
  // skeleton, never a page of zeroes that fills in a moment later.
  if (transactions.length > 0 && !result && !error) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-28 rounded-lg" />
        <Skeleton className="h-56 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="space-y-3">
        {smsMode ? (
          importing || booting ? (
            <div className="space-y-3" aria-busy="true">
              <Skeleton className="h-28 rounded-lg" />
              <Skeleton className="h-56 rounded-lg" />
            </div>
          ) : (
            <Card className="flex min-h-72 items-center justify-center">
              <CardContent className="flex max-w-sm flex-col items-center gap-4 pt-4 text-center">
                <p className="text-lg font-medium">No SMS imported yet</p>
                <Button size="lg" onClick={onImportSms}>
                  <MessageSquareText />
                  Import SMS
                </Button>
              </CardContent>
            </Card>
          )
        ) : historyCount === 0 ? (
          <Card className="flex min-h-72 items-center justify-center">
            <CardContent className="flex max-w-sm flex-col items-center gap-4 pt-4 text-center">
              <p className="text-lg font-medium">No statements yet</p>
              <Button size="lg" onClick={onImport}>
                <FileUp />
                Import statement
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="flex min-h-72 items-center justify-center">
            <CardContent className="flex max-w-sm flex-col items-center gap-4 pt-4 text-center">
              <p className="text-lg font-medium">Nothing active</p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={onBrowseHistory}>Choose from history</Button>
                <Button variant="outline" onClick={onImport}>
                  <FileUp />
                  Import new statement
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-4 text-sm text-destructive">
            {error}
          </CardContent>
        </Card>
      )}

      {visible && (
        <div aria-busy={updating} className={cn("space-y-3", updating && "opacity-70")}>
          <HomeCards result={visible} transactions={transactions} latestDay={latestDay} />
        </div>
      )}
    </div>
  );
}
