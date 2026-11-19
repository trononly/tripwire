import { useEffect, useMemo, useState } from "react";
import { Banknote, Loader2, Pencil, Plus, Receipt, Smartphone, Store, Undo2 } from "lucide-react";
import { Events } from "@wailsio/runtime";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AutomationInterruptedNotice,
  AutomationStatusLine,
} from "@/components/automation-gate";
import { useAutomationAvailable } from "@/hooks/use-automation-available";
import { PlanActionSheet } from "@/components/plan-action-sheet";
import { RecurringPlanSheet } from "@/components/recurring-plan-sheet";
import { useLongPress } from "@/hooks/use-long-press";
import { useQuickEntry } from "@/hooks/use-quick-entry";
import {
  dayKey,
  dueLabel,
  nextDue,
  planAmountShillings,
  planScript,
  planTarget,
  reminderLabel,
  toPlanLike,
  type LastPaid,
  type PlanDraft,
} from "@/lib/recurring-plans";
import { formatMoney, formatFullDate } from "@/lib/format";
import {
  isAndroidBridge,
  openUssdAutomationSettings,
} from "@/lib/sms-bridge";
import { interruptedCopy } from "@/lib/automation-status";
import { isValidAmount } from "@/lib/ussd-menus";
import type { RecurringPlan } from "../../bindings/mpesa-analyzer/internal/store/models";

const cadenceStyles: Record<string, { label: string; className: string }> = {
  weekly: { label: "Weekly", className: "bg-muted text-muted-foreground" },
  "bi-weekly": { label: "Bi-weekly", className: "bg-muted text-muted-foreground" },
  monthly: { label: "Monthly", className: "bg-muted text-muted-foreground" },
  quarterly: { label: "Quarterly", className: "bg-muted text-muted-foreground" },
};

function cadenceStyle(cadence: string) {
  return (
    cadenceStyles[cadence] ?? {
      label: cadence,
      className: "bg-muted text-muted-foreground",
    }
  );
}

function planIcon(kind: string) {
  switch (kind) {
    case "paybill":
      return Receipt;
    case "till":
      return Store;
    case "pochi":
      return Smartphone;
    default:
      return Banknote;
  }
}

function shortDay(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  const parsed = new Date(year, (month ?? 1) - 1, date ?? 1);
  return parsed.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

const STATUS_TEXT: Record<string, string> = {
  starting: "Opening the M-PESA menu…",
  step: "Filling the menu…",
  "awaiting-pin": "Enter your M-PESA PIN in the phone dialog.",
  "awaiting-confirm": "Confirm the payment in the phone dialog.",
  complete: "Menu ready - finish with your PIN.",
  aborted: "Payment stopped.",
  interrupted: "Automation was interrupted.",
};

export interface RecurringPaymentsProps {
  /** The user's own plans. */
  plans: RecurringPlan[];
  /** Last paid per plan id, matched against the active statements. */
  lastPaid: Record<string, LastPaid | null>;
  loading?: boolean;
  /** The SIM of the wallet selected in the header, or null in statements mode. */
  simKey?: string | null;
  onSavePlan: (draft: PlanDraft, id: string | null) => Promise<boolean>;
  onDeletePlan: (id: string) => Promise<boolean>;
  /** Mark one due date as handled (cash paid or skipped); "" undoes it. */
  onSkipPlan: (id: string, due: string) => Promise<boolean>;
}

/**
 * Recurring payments: the plans the user set up, with Play and reminders.
 * The card owns the user's payment plans only; detected bills live in the
 * analysis elsewhere and never surface here.
 */
export function RecurringPayments({
  plans,
  lastPaid,
  loading,
  simKey,
  onSavePlan,
  onDeletePlan,
  onSkipPlan,
}: RecurringPaymentsProps) {
  const auto = useAutomationAvailable();

  const planRows = useMemo(
    () =>
      plans
        .map((plan) => ({
          plan,
          lastPaid: lastPaid[plan.id] ?? null,
          due: nextDue(toPlanLike(plan)),
        }))
        .sort((a, b) => a.due.getTime() - b.due.getTime()),
    [plans, lastPaid],
  );

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<RecurringPlan | null>(null);
  const [prefill, setPrefill] = useState<PlanDraft | null>(null);
  // The plan a long-press menu is open for.
  const [actionPlan, setActionPlan] = useState<RecurringPlan | null>(null);
  const [actionOpen, setActionOpen] = useState(false);
  const [paying, setPaying] = useState<RecurringPlan | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payError, setPayError] = useState<string | null>(null);
  const [runningPlan, setRunningPlan] = useState<string | null>(null);
  const qe = useQuickEntry();

  useEffect(() => {
    if (qe.status === "aborted") {
      const copy = interruptedCopy(qe.code ?? undefined);
      toast.error(copy.title, { description: copy.body });
      setRunningPlan(null);
    }
    if (qe.status === "interrupted") {
      // The persistent notice carries the verification warning; a toast as
      // well would say the same thing twice.
      setRunningPlan(null);
    }
    if (qe.status === "complete" || qe.status === "idle") {
      setRunningPlan(null);
    }
  }, [qe.status, qe.code]);

  // A receipt landing means the run is over, even if the automation event
  // never reached the WebView.
  useEffect(() => {
    const onTransaction = () => setRunningPlan(null);
    window.addEventListener("mpesa:transactions", onTransaction);
    return () => window.removeEventListener("mpesa:transactions", onTransaction);
  }, []);

  function openAdd() {
    setEditing(null);
    setPrefill(null);
    setSheetOpen(true);
  }

  function openEdit(plan: RecurringPlan) {
    setEditing(plan);
    setPrefill(null);
    setSheetOpen(true);
  }

  /** Skip the occurrence the card is showing; the next one moves up. */
  async function skipCycle(plan: RecurringPlan) {
    await onSkipPlan(plan.id, dayKey(nextDue(toPlanLike(plan))));
  }

  /** Open the amount prompt only for "ask each time" plans. A fixed plan
   * dials straight away: Pay now means pay now. */
  function openPay(plan: RecurringPlan) {
    if (plan.amount > 0) {
      startPlanPayment(plan, String(Math.round(plan.amount / 100)));
      return;
    }
    setPaying(plan);
    setPayError(null);
    setPayAmount(
      planAmountShillings(toPlanLike(plan), lastPaid[plan.id]?.amount ?? 0),
    );
  }

  function startPlanPayment(plan: RecurringPlan, amountShillings: string) {
    if (!isValidAmount(amountShillings)) {
      setPayError("Enter a whole-shilling amount between 1 and 500,000.");
      return;
    }
    const script = planScript(toPlanLike(plan), amountShillings.trim());
    if (!script) {
      setPayError("This payment's details are incomplete. Edit it first.");
      return;
    }
    if (!isAndroidBridge()) {
      toast.info("Guided payments need the Android app.");
      return;
    }
    if (!auto.available) {
      auto.recheck();
      toast.error("Turn on M-Pesa automation first.", {
        action: { label: "Open settings", onClick: openUssdAutomationSettings },
      });
      return;
    }
    if (!auto.running) {
      auto.recheck();
      toast.error("Automation is enabled, but Android hasn't connected it yet.", {
        action: { label: "Open settings", onClick: openUssdAutomationSettings },
      });
      return;
    }
    Events.Once("common:ussd", (ev) => {
      const data = ev.data as { ok: boolean; error?: string };
      if (!data?.ok) {
        toast.error(
          data?.error === "call permission denied"
            ? "Call permission was denied."
            : data?.error === "automation disabled"
              ? "Automation was switched off."
              : data?.error === "sim access required"
                ? "Allow phone access in Settings so Tripwire can use your SIM."
                : data?.error === "sim selection required"
                  ? "Tripwire could not select your SIM. Allow phone access in Settings, then try again."
                  : "Could not start the transaction.",
        );
      }
    });
    setRunningPlan(plan.id);
    setPaying(null);
    setPayError(null);
    qe.start(script, simKey);
  }

  function startPayment() {
    if (!paying) return;
    startPlanPayment(paying, payAmount);
  }

  const busy = runningPlan !== null;
  const activeStatus = runningPlan ? STATUS_TEXT[qe.status] ?? null : null;

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div className="min-w-0">
          <CardTitle>Recurring payments</CardTitle>
          {planRows.length > 0 ? (
            <CardDescription>
              {planRows.length}{" "}
              {planRows.length === 1 ? "payment" : "payments"} · next due{" "}
              {dueLabel(planRows[0].due).toLowerCase()}
            </CardDescription>
          ) : null}
        </div>
        <Button variant="outline" size="sm" onClick={openAdd} className="gap-1.5">
          <Plus className="size-4" aria-hidden />
          Add
        </Button>
      </CardHeader>

      <CardContent className="pt-0">
        {auto.available && !auto.running ? (
          <div className="mb-3">
            <AutomationStatusLine
              available={auto.available}
              running={auto.running}
              onRetry={auto.recheck}
            />
          </div>
        ) : null}

        {qe.status === "interrupted" || qe.status === "aborted" ? (
          <div className="mb-3">
            <AutomationInterruptedNotice
              code={qe.code ?? undefined}
              onDismiss={qe.dismiss}
            />
          </div>
        ) : null}

        {loading && planRows.length === 0 ? (
          <p className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Loading your payments…
          </p>
        ) : planRows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No plans yet. Add the bills you pay on a schedule.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {planRows.map((row) => (
              <li key={row.plan.id}>
                <PlanRow
                  plan={row.plan}
                  lastPaid={row.lastPaid}
                  due={row.due}
                  status={runningPlan === row.plan.id ? activeStatus : null}
                  busy={busy}
                  onPlay={() => openPay(row.plan)}
                  onEdit={() => openEdit(row.plan)}
                  onSkip={() => void skipCycle(row.plan)}
                  onUnskip={() => void onSkipPlan(row.plan.id, "")}
                  onActions={() => {
                    setActionPlan(row.plan);
                    setActionOpen(true);
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <PlanActionSheet
        plan={actionPlan}
        open={actionOpen}
        onOpenChange={setActionOpen}
        onEdit={() => {
          if (actionPlan) openEdit(actionPlan);
        }}
        onDelete={onDeletePlan}
      />

      <RecurringPlanSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        plan={editing}
        prefill={prefill}
        plans={plans}
        onSave={onSavePlan}
        onDelete={onDeletePlan}
        onEditPlan={(next) => {
          setEditing(next);
          setPrefill(null);
        }}
      />

      <Drawer open={paying !== null} onOpenChange={(open) => !open && setPaying(null)}>
        <DrawerContent>
          <DrawerHeader className="text-left">
            <DrawerTitle>{paying?.name ?? "Pay"}</DrawerTitle>
            <DrawerDescription>
              {paying ? planTarget(toPlanLike(paying)) : ""}
            </DrawerDescription>
          </DrawerHeader>

          <div className="space-y-3 px-4 pb-2">
            <div className="space-y-2">
              <Label htmlFor="pay-amount">Amount (KES)</Label>
              <Input
                id="pay-amount"
                value={payAmount}
                onChange={(e) => {
                  setPayAmount(e.target.value);
                  setPayError(null);
                }}
                inputMode="numeric"
                autoComplete="off"
                autoFocus
              />
              {payError && <p className="text-sm text-destructive">{payError}</p>}
            </div>
          </div>

          <DrawerFooter>
            <Button type="button" onClick={startPayment} className="w-full">
              Pay now
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </Card>
  );
}

function PlanRow({
  plan,
  lastPaid,
  due,
  status,
  busy,
  onPlay,
  onEdit,
  onSkip,
  onUnskip,
  onActions,
}: {
  plan: RecurringPlan;
  lastPaid: LastPaid | null;
  due: Date;
  status: string | null;
  busy: boolean;
  onPlay: () => void;
  onEdit: () => void;
  onSkip: () => void;
  onUnskip: () => void;
  onActions: () => void;
}) {
  const Icon = planIcon(plan.kind);
  const cadence = cadenceStyle(plan.cadence);
  const amount = plan.amount > 0 ? plan.amount : lastPaid?.amount ?? null;
  const skipped = Boolean(plan.skippedFor);
  const longPress = useLongPress(onActions);

  return (
    <div
      {...longPress}
      className="flex select-none items-start gap-3 py-4"
    >
      <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-muted text-muted-foreground">
        <Icon className="size-[18px]" strokeWidth={1.75} aria-hidden />
      </span>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium" title={plan.name}>
              {plan.name}
            </p>
            <p className="truncate text-[12px] text-muted-foreground">
              {planTarget(toPlanLike(plan))}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="num text-lg font-semibold tracking-tight">
              {amount !== null ? formatMoney(amount) : "Variable"}
            </p>
            <span
              className={`mt-0.5 inline-block px-1.5 py-0.5 text-[12px] font-medium ${cadence.className}`}
            >
              {cadence.label}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted-foreground">
          <span>{dueLabel(due)}</span>
          <span aria-hidden>·</span>
          <span>
            {lastPaid
              ? `Last paid ${formatFullDate(lastPaid.date)}`
              : "Not paid yet"}
          </span>
          {reminderLabel(toPlanLike(plan)) ? (
            <>
              <span aria-hidden>·</span>
              <span>{reminderLabel(toPlanLike(plan))}</span>
            </>
          ) : null}
          {skipped ? (
            <>
              <span aria-hidden>·</span>
              <span>Skipped {shortDay(plan.skippedFor)}</span>
            </>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <Button size="sm" onClick={onPlay} disabled={busy} className="gap-1.5">
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <Smartphone className="size-3.5" aria-hidden />
            )}
            {busy ? "Paying…" : "Pay now"}
          </Button>
          {skipped ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={onUnskip}
              className="gap-1.5 text-muted-foreground"
            >
              <Undo2 className="size-3.5" aria-hidden />
              Undo skip
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={onSkip}
              disabled={busy}
              aria-label="Skip this cycle"
            >
              Skip
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Edit ${plan.name}`}
            title={`Edit ${plan.name}`}
            onClick={onEdit}
            className="text-muted-foreground"
          >
            <Pencil className="size-4" />
          </Button>
        </div>
        {status && (
          <p className="text-[12px] text-muted-foreground">{status}</p>
        )}
      </div>
    </div>
  );
}
