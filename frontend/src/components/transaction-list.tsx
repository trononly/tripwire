import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { typeStyle } from "@/lib/transaction-types";
import { Button } from "@/components/ui/button";
import { Private } from "@/components/privacy";
import { formatMoney, formatFullDate } from "@/lib/format";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer";
import { TransactionGroups } from "../../bindings/mpesa-analyzer/parseservice";
import type { DayGroup } from "../../bindings/mpesa-analyzer/models";

/** Non-null normalized day group (Go slices arrive nullable at the bridge). */
export type Group = {
  dayKey: string;
  endBalance: number;
  endOwed: number;
  txs: TransactionView[];
};
export type TransactionView = NonNullable<DayGroup["txs"]>[number];
import type * as parser from "../../bindings/mpesa-analyzer/internal/parser/models";
import { CategoryIcon } from "@/components/category-icon";
import { vibrateIfEnabled } from "@/lib/motion-settings";
import { useCategoryVersion } from "@/lib/category-refresh";

const BATCH_SIZE = 20;

// Semantic transaction type -> icon, tint and label: shared with the
// recurring-payment cards, see lib/transaction-types.

// ---------------------------------------------------------------------------
// Display helpers (presentation-only: locale strings, icons, prefixes)
// ---------------------------------------------------------------------------

/** Signed amount without currency (currency context is per-group). */
export function formatAmount(cents: number): string {
  const value = (Math.abs(cents) / 100).toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${cents < 0 ? "-" : "+"}KES ${value}`;
}

/** Local calendar-day key ("YYYY-MM-DD") for a Date. */
function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/** "Today, 28 Apr" / "Yesterday, 27 Apr" / "28 Apr" / "28 Apr 2024". */
function dateGroupLabel(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const day = date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
  const today = localDayKey(new Date());
  const yesterday = localDayKey(new Date(Date.now() - 86_400_000));
  if (dayKey === today) return `Today, ${day}`;
  if (dayKey === yesterday) return `Yesterday, ${day}`;
  if (date.getFullYear() === new Date().getFullYear()) return day;
  return `${day} ${y}`;
}

// ---------------------------------------------------------------------------
// Data hook: grouping/sorting/categorization happen in Go, once per dataset.
// ---------------------------------------------------------------------------

/**
 * Calls the Go backend to sort, categorize and day-group the dataset.
 * Returns groups with true end-of-day balances, ready to render.
 */
export function useTransactionGroups(txs: parser.Transaction[]): Group[] {
  const [groups, setGroups] = useState<Group[]>([]);
  // Category rules are resolved in Go. A revision bump re-runs the grouping
  // so the row badges update the moment a category is assigned.
  const categoryVersion = useCategoryVersion();
  useEffect(() => {
    if (txs.length === 0) {
      setGroups([]);
      return;
    }
    let cancelled = false;
    TransactionGroups(txs)
      .then((g) => {
        if (cancelled) return;
        // Normalize nullable Go slices once at the boundary.
        setGroups(
          (g ?? []).map((d) => ({
            dayKey: d.dayKey,
            endBalance: d.endBalance,
            endOwed: d.endOwed ?? 0,
            txs: d.txs ?? [],
          })),
        );
      })
      .catch(() => {
        if (!cancelled) setGroups([]);
      });
    return () => {
      cancelled = true;
    };
  }, [txs, categoryVersion]);
  return groups;
}

// Row

function TxRow({
  tx,
  onSelect,
  onSetCategory,
}: {
  tx: TransactionView;
  onSelect: () => void;
  onSetCategory?: (tx: TransactionView) => void;
}) {
  // Who: the counterparty extracted in Go, falling back to the type label
  // when the statement names none ("Airtime Purchase", "Fuliza M-Pesa",
  // "Fuliza Access Fee", "Fuliza Repayment ...").
  // What: the user's category when set, otherwise the type label, plus time.
  const { icon: Icon, className: tint, label: typeLabel } = typeStyle(tx.type);
  const title = tx.counterparty || typeLabel;
  const category = tx.customCategoryId
    ? { name: tx.customCategoryName, icon: tx.customCategoryIcon }
    : null;
  const moneyIn = tx.amount >= 0;
  const badge = (
    <span
      className={`flex size-9 shrink-0 items-center justify-center rounded-[10px] transition-colors group-hover/badge:bg-muted/80 ${tint}`}
      aria-hidden
    >
      {category ? (
        <CategoryIcon icon={category.icon} className="size-4.5" />
      ) : (
        <Icon className="size-4.5" strokeWidth={1.75} />
      )}
    </span>
  );
  return (
    <div className="flex w-full items-stretch transition-colors hover:bg-muted/50">
      {/* The badge is its own tap target: the row click opens the receipt, the
          icon labels. A nested button would be invalid HTML, so the row is a
          container with two sibling buttons. */}
      {onSetCategory ? (
        <button
          type="button"
          onClick={() => {
            vibrateIfEnabled(8);
            onSetCategory(tx);
          }}
          className="group/badge flex shrink-0 touch-manipulation items-center justify-center py-2.5 pl-3 [-webkit-touch-callout:none]"
          aria-label={`${
            category ? `Change category, currently ${category.name}` : "Set category"
          } for ${title}`}
        >
          {badge}
        </button>
      ) : (
        <span className="flex shrink-0 items-center justify-center py-2.5 pl-3">
          {badge}
        </span>
      )}

      <button
        type="button"
        onClick={() => {
          vibrateIfEnabled(8);
          onSelect();
        }}
        className="flex min-w-0 flex-1 touch-manipulation items-center gap-3 py-2.5 pr-3 pl-3 text-left select-none"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium leading-5">
            {title}
          </span>
          <span className="block truncate text-[13px] leading-4 text-muted-foreground">
            {category
              ? `${category.name} · `
              : tx.counterparty
                ? `${typeLabel} · `
                : ""}
            {tx.date.slice(11, 16)}
          </span>
        </span>

        {/* Out in ink, in with a plus in green: red stays for data status,
            never for an ordinary amount. */}
        <span
          className={`whitespace-nowrap text-[15px] font-medium tabular-nums ${
            moneyIn ? "text-money-in" : "text-money-out"
          }`}
        >
          {formatAmount(tx.amount)}
        </span>
      </button>
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono,
  wrap,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
  wrap?: boolean;
}) {
  return (
    <div className="grid grid-cols-[5.5rem_1fr] items-baseline gap-x-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={`min-w-0 font-medium ${mono ? "font-mono" : ""} ${
          wrap ? "wrap-break-words" : "truncate"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * Receipt sheet: what one tap on a row opens. The amount is the hero with the
 * counterparty under it, the keyed fields follow, and the reference sits at
 * the foot where a receipt puts it.
 */
function ReceiptSheet({
  tx,
  onClose,
}: {
  tx: TransactionView | null;
  onClose: () => void;
}) {
  return (
    <Drawer open={tx !== null} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent>
        <DrawerTitle className="sr-only">Transaction receipt</DrawerTitle>
        <DrawerDescription className="sr-only">
          Full details of the tapped transaction
        </DrawerDescription>
        {tx && (
          <div className="px-4 pb-4">
            <div className="flex flex-col items-center gap-1 pb-4 pt-1 text-center">
              <Private label="Tap to reveal the amount">
                <span
                  className={`text-[28px] font-semibold tabular-nums ${
                    tx.amount >= 0 ? "text-money-in" : "text-money-out"
                  }`}
                >
                  {formatAmount(tx.amount)}
                </span>
              </Private>
              <span className="text-[13px] text-muted-foreground">
                {tx.counterparty || typeStyle(tx.type).label}
              </span>
            </div>
            <div className="divide-y divide-border border-y border-border text-[13px]">
              {/* The parsed statement carries no wallet/SIM field, so the
                  type label holds that slot: it names which M-Pesa movement
                  this was (Buy Goods, Fuliza, Received ...). */}
              <DetailRow
                label="When"
                value={`${formatFullDate(tx.date)}, ${tx.date.slice(11, 16)}`}
              />
              <DetailRow
                label="Category"
                value={
                  tx.customCategoryId ? (
                    <span className="inline-flex items-center gap-1.5">
                      <CategoryIcon
                        icon={tx.customCategoryIcon}
                        className="size-4"
                      />
                      {tx.customCategoryName}
                    </span>
                  ) : (
                    typeStyle(tx.type).label
                  )
                }
              />
              {tx.customCategoryId ? (
                <DetailRow label="Type" value={typeStyle(tx.type).label} />
              ) : null}
              <DetailRow label="Description" value={tx.description} wrap />
              <DetailRow
                label="Balance after"
                value={
                  <Private label="Tap to reveal">
                    {formatMoney(tx.balance)}
                  </Private>
                }
              />
              {tx.status && tx.status.toLowerCase() !== "completed" ? (
                <DetailRow label="Status" value={tx.status} />
              ) : null}
              <DetailRow
                label="Reference"
                mono
                value={<span className="text-muted-foreground">{tx.id}</span>}
              />
            </div>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export type TransactionListProps = {
  /** Prepared day groups (from useTransactionGroups), already filtered. */
  groups: Group[];
  /** Render the inline load-more footer. Default true. */
  showPagination?: boolean;
  /** Opens the category picker for a row's badge. Omit for read-only lists. */
  onSetCategory?: (tx: TransactionView) => void;
};

/** Slices the first `limit` rows out of the groups, preserving group headers. */
function sliceGroups(
  groups: Group[],
  limit: number,
): { page: Group[]; totalRows: number } {
  let totalRows = 0;
  for (const g of groups) totalRows += g.txs.length;
  const page: Group[] = [];
  let count = 0;
  for (const g of groups) {
    if (count >= limit) break;
    const take = Math.min(g.txs.length, limit - count);
    // Carry the group's true end-of-day balance even when a day is split
    // across load-more boundaries.
    page.push({ ...g, txs: g.txs.slice(0, take) });
    count += take;
  }
  return { page, totalRows };
}

/**
 * Shared transaction renderer: dense two-line rows grouped by calendar day,
 * each group under a sticky date header carrying the end-of-day balance. A
 * tap on a row opens the receipt sheet; grouping, sorting and categorization
 * are computed in Go (see ParseService.TransactionGroups), this component
 * only paginates and renders.
 */
export function TransactionList({
  groups,
  showPagination = true,
  onSetCategory,
}: TransactionListProps) {
  // The one selection: the transaction whose receipt is open, or none.
  const [selected, setSelected] = useState<TransactionView | null>(null);
  // Infinite scroll: rows render in batches; the sentinel below loads more.
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setVisibleCount(BATCH_SIZE);
  }, [groups]);

  const { page, totalRows } = useMemo(
    () => sliceGroups(groups, visibleCount),
    [groups, visibleCount],
  );
  const shownCount = page.reduce((n, g) => n + g.txs.length, 0);
  const hasMore = shownCount < totalRows;

  // Loading more never replaces rendered rows, so no scroll jump to manage.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisibleCount((c) => Math.min(c + BATCH_SIZE, totalRows));
        }
      },
      { rootMargin: "400px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, totalRows]);

  return (
    <div className="space-y-4">
      {page.length ? (
        <div className="space-y-3">
          {page.map((g) => (
            <section key={g.dayKey}>
              <header className="sticky top-0 z-10 flex items-baseline justify-between gap-2 bg-background py-2">
                <span className="text-[13px] font-medium">
                  {dateGroupLabel(g.dayKey)}
                </span>
                <Private label="Tap to reveal the balance">
                  <span className="text-xs tabular-nums text-muted-foreground">
                    Bal {formatMoney(g.endBalance)}
                    {g.endOwed > 0 ? ` · Owes ${formatMoney(g.endOwed)}` : ""}
                  </span>
                </Private>
              </header>
              <div className="divide-y divide-border">
                {g.txs.map((t) => (
                  <TxRow
                    key={t.id}
                    tx={t}
                    onSelect={() => setSelected(t)}
                    onSetCategory={onSetCategory}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border py-8 text-center text-sm text-muted-foreground">
          No transactions match your search or filters.
        </div>
      )}

      {showPagination && hasMore && (
        <div className="flex justify-center py-1">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() =>
              setVisibleCount((c) => Math.min(c + BATCH_SIZE, totalRows))
            }
          >
            Show earlier transactions
          </Button>
        </div>
      )}
      {hasMore && <div ref={sentinelRef} aria-hidden="true" />}

      <ReceiptSheet tx={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
