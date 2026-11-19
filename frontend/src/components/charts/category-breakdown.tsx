import type { ReactNode } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/format";

/**
 * One spending label, already normalised by the caller. The built-in M-Pesa
 * categories and the user's own categories share this shape.
 */
export type SpendSlice = {
  key: string;
  label: string;
  /** Signed cents; only outflows (negative) are drawn here. */
  amount: number;
  count: number;
};

/**
 * "Where it went": a donut ring beside a legend, per the approved mockup
 * (drawRing + legend). The legend row is the tap target, so the ring itself
 * is inert and described to screen readers via its aria-label.
 */
export function CategoryBreakdown({
  slices,
  onSelectSlice,
  toolbar,
  footer,
  empty,
  description,
}: {
  slices: SpendSlice[];
  onSelectSlice?: (key: string) => void;
  /** The M-Pesa / My categories switch, rendered beside the title. */
  toolbar?: ReactNode;
  /** Rendered under the list (the Manage link in the custom view). */
  footer?: ReactNode;
  /** Replaces the chart when there is nothing to draw. */
  empty?: ReactNode;
  description?: string;
}) {
  const rows = slices
    .filter((slice) => slice.amount < 0)
    .map((slice) => ({ ...slice, value: Math.abs(slice.amount) }))
    .sort((a, b) => b.value - a.value);
  const total = rows.reduce((sum, row) => sum + row.value, 0);

  const rampColor = (rank: number) =>
    `var(--donut-${rank < 5 ? rank + 1 : 2 + ((rank - 5) % 4)})`;

  // Contiguous arcs from 12 o'clock clockwise; each sweep is value/total.
  // SVG angles run clockwise with sweep-flag 1 in its y-down coordinates.
  let angle = -Math.PI / 2;
  const arcs = rows.map((row, rank) => {
    const start = angle;
    const end = angle + (row.value / total) * Math.PI * 2;
    angle = end;
    const large = end - start > Math.PI ? 1 : 0;
    return {
      key: row.key,
      color: rampColor(rank),
      d: `M ${60 + 46 * Math.cos(start)} ${60 + 46 * Math.sin(start)} A 46 46 0 ${large} 1 ${60 + 46 * Math.cos(end)} ${60 + 46 * Math.sin(end)}`,
    };
  });

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Where it went</CardTitle>
          {toolbar}
        </div>
        <CardDescription>
          {description ??
            (total > 0
              ? `${formatMoney(total)} across ${rows.length} ${
                  rows.length === 1 ? "category" : "categories"
                }`
              : "No spending in this period.")}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1">
        {empty ? (
          empty
        ) : rows.length === 0 ? (
          <div className="flex min-h-56 items-center justify-center px-4 text-center text-sm text-muted-foreground">
            No spending in this period.
          </div>
        ) : (
          <div className="mt-3 flex items-center gap-4">
            <svg
              viewBox="0 0 120 120"
              width={120}
              height={120}
              role="img"
              aria-label={`Spending by category, ${rows[0].label} is the largest share`}
            >
              {arcs.map((arc) => (
                <path
                  key={arc.key}
                  d={arc.d}
                  fill="none"
                  stroke={arc.color}
                  strokeWidth={11}
                  strokeLinecap="butt"
                />
              ))}
            </svg>
            <ul className="flex-1 space-y-1">
              {rows.map((row, rank) => (
                <li key={row.key}>
                  <button
                    type="button"
                    onClick={() => onSelectSlice?.(row.key)}
                    className="-mx-1 flex w-full items-center gap-2 rounded-md px-1 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted/40"
                  >
                    <span
                      aria-hidden="true"
                      className="size-[9px] shrink-0 rounded-full"
                      style={{ backgroundColor: rampColor(rank) }}
                    />
                    <span className="truncate">{row.label}</span>
                    <span className="ml-auto shrink-0 whitespace-nowrap font-medium tabular-nums">
                      {formatMoney(row.value)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {footer}
      </CardContent>
    </Card>
  );
}
