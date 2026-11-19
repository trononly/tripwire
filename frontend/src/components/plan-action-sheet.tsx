import { useEffect, useState } from "react";
import { Loader2, Pencil, Trash2 } from "lucide-react";

import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { planTarget, toPlanLike } from "@/lib/recurring-plans";
import { vibrateIfEnabled } from "@/lib/motion-settings";
import { cn } from "@/lib/utils";
import type { RecurringPlan } from "../../bindings/mpesa-analyzer/internal/store/models";

interface PlanActionSheetProps {
  /** The plan the menu acts on; null while closed. */
  plan: RecurringPlan | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Opens the plan's own edit sheet for this plan. */
  onEdit: () => void;
  /** The same delete the plan sheet uses, toast feedback included. */
  onDelete: (id: string) => Promise<boolean>;
}

/**
 * The long-press menu for one recurring plan row: edit it or delete it right
 * where the row is. Both plan surfaces (home's Coming up card and the
 * recurring payments list) share this one sheet; edit and delete stay the
 * plan sheet's own flows, so each thing still happens one way.
 */
export function PlanActionSheet({
  plan,
  open,
  onOpenChange,
  onEdit,
  onDelete,
}: PlanActionSheetProps) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Every open starts clean: a stale "tap again" must never delete on the
  // first press of a new menu.
  useEffect(() => {
    if (open) {
      setConfirming(false);
      setDeleting(false);
    }
  }, [open, plan?.id]);

  async function handleDelete() {
    if (!plan || deleting) return;
    // The plan sheet's two-tap confirm, restated as a row.
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setDeleting(true);
    const ok = await onDelete(plan.id);
    setDeleting(false);
    if (ok) onOpenChange(false);
  }

  // Rows match the Pay menu: icon tile, label plus quiet description.
  const rowClass =
    "flex min-h-11 w-full items-center gap-3 rounded-[10px] px-2 py-2 text-left transition-colors hover:bg-muted";

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader className="text-left">
          <DrawerTitle>{plan?.name ?? ""}</DrawerTitle>
          <DrawerDescription>
            {plan ? planTarget(toPlanLike(plan)) : ""}
          </DrawerDescription>
        </DrawerHeader>

        <div className="flex flex-col gap-1 px-2 pb-3">
          <button
            type="button"
            className={rowClass}
            onClick={() => {
              vibrateIfEnabled(10);
              onOpenChange(false);
              onEdit();
            }}
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-muted">
              <Pencil className="size-5" strokeWidth={1.75} aria-hidden />
            </span>
            <span className="flex flex-col">
              <span className="text-sm font-medium">Edit plan</span>
              <span className="text-xs text-muted-foreground">
                Name, amount and schedule
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => void handleDelete()}
            disabled={deleting}
            className={cn(
              rowClass,
              "text-destructive hover:bg-destructive/10",
              confirming && "bg-destructive/10 hover:bg-destructive/20",
            )}
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-muted">
              {deleting ? (
                <Loader2 className="size-5 animate-spin" aria-hidden />
              ) : (
                <Trash2 className="size-5" strokeWidth={1.75} aria-hidden />
              )}
            </span>
            <span className="flex flex-col">
              <span className="text-sm font-medium">
                {deleting
                  ? "Deleting…"
                  : confirming
                    ? "Tap again to delete"
                    : "Delete plan"}
              </span>
              <span className="text-xs text-muted-foreground">
                {confirming ? "This cannot be undone" : "Stop tracking this payment"}
              </span>
            </span>
          </button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
