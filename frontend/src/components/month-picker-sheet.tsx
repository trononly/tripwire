import { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";

import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { vibrateIfEnabled } from "@/lib/motion-settings";
import { cn } from "@/lib/utils";
import { ALL_MONTHS, type MonthOption } from "@/hooks/use-month-scope";

const MONTH_CELLS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/**
 * The Insights month picker: one button at the top of the page opens a
 * bottom sheet with the months of the data as a grid, grouped by year.
 * Months without data, and anything past the newest data month, are dead
 * cells; "Show everything" is the way back to the whole dataset. The
 * picker lives here only: Insights is where month scope means something.
 */
export function MonthPickerSheet({
  months,
  selected,
  onSelect,
}: {
  months: MonthOption[];
  selected: string;
  onSelect: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState<string | null>(null);

  // Every open lands on the selected month's year, or the newest one.
  useEffect(() => {
    if (!open) return;
    setYear(
      selected === ALL_MONTHS
        ? (months[0]?.key.slice(0, 4) ?? null)
        : selected.slice(0, 4),
    );
  }, [open, selected, months]);

  const byYear = useMemo(() => {
    const map = new Map<string, MonthOption[]>();
    for (const m of months) {
      const list = map.get(m.key.slice(0, 4)) ?? [];
      list.push(m);
      map.set(m.key.slice(0, 4), list);
    }
    return map;
  }, [months]);

  const years = useMemo(
    () => [...byYear.keys()].sort().reverse(),
    [byYear],
  );

  const newest = months[0]?.key ?? "";

  const current = useMemo(
    () =>
      selected === ALL_MONTHS
        ? null
        : (months.find((m) => m.key === selected) ?? null),
    [months, selected],
  );

  return (
    <>
      <button
        type="button"
        onClick={() => {
          vibrateIfEnabled(8);
          setOpen(true);
        }}
        className="tile inline-flex items-center gap-1.5"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        {current ? `${current.label} ${current.key.slice(0, 4)}` : "All activity"}
        <ChevronDown className="size-3.5" aria-hidden />
      </button>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent>
          <DrawerHeader className="text-left">
            <DrawerTitle>Pick a month</DrawerTitle>
            <DrawerDescription>
              Insights then speaks for that month alone.
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-4">
            <div className="flex flex-wrap gap-1.5">
              {years.map((y) => (
                <button
                  key={y}
                  type="button"
                  aria-pressed={year === y}
                  onClick={() => {
                    vibrateIfEnabled(8);
                    setYear(y);
                  }}
                  className={cn(
                    "tile px-3 py-1 text-xs",
                    year === y && "tile-active",
                  )}
                >
                  {y}
                </button>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-1.5">
              {MONTH_CELLS.map((name, i) => {
                const key = `${year}-${String(i + 1).padStart(2, "0")}`;
                const m = (year ? byYear.get(year) : [])?.find(
                  (x) => x.key === key,
                );
                const dead = !m || key > newest;
                const on = m?.key === selected;
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={dead}
                    aria-pressed={on}
                    onClick={() => {
                      if (!m) return;
                      vibrateIfEnabled(8);
                      onSelect(m.key);
                      setOpen(false);
                    }}
                    className={cn(
                      "tile flex flex-col items-center py-2",
                      on && "tile-active",
                      dead && "opacity-30",
                    )}
                  >
                    <span>{name}</span>
                    {m && (
                      <span className="text-[10px] font-normal text-muted-foreground">
                        {Math.round(Math.abs(m.out) / 100000)
                          ? `${(Math.abs(m.out) / 100000).toFixed(0)}k out`
                          : "quiet"}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => {
                vibrateIfEnabled(8);
                onSelect(ALL_MONTHS);
                setOpen(false);
              }}
              className="tile mt-3 flex w-full justify-center"
            >
              Show everything
            </button>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
