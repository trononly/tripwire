import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Events } from "@wailsio/runtime";
import { toast } from "sonner";
import {
  Contact,
  Loader2,
  Send as SendIcon,
  Store,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AutomationInterruptedNotice, AutomationStatusLine } from "@/components/automation-gate";
import { useAutomationAvailable } from "@/hooks/use-automation-available";
import AmountField from "@/components/amount-field";
import FavouriteStar from "@/components/favourite-star";
import FavouritesRow from "@/components/favourites-row";
import FavouritesSheet from "@/components/favourites-sheet";
import { cn } from "@/lib/utils";
import { formatAmountInput, formatPhoneInput } from "@/lib/format";
import {
  formatFavouritePhone,
  isActiveFavourite,
} from "@/lib/favourites";
import {
  buildSendScript,
  isValidAmount,
  normalizePhone,
  type SendKind,
} from "@/lib/ussd-menus";
import {
  isAndroidBridge,
  openUssdAutomationSettings,
} from "@/lib/sms-bridge";
import { useQuickEntry } from "@/hooks/use-quick-entry";
import { PageHeader } from "@/components/page-header";
import { useFavourites } from "@/hooks/use-favourites";
import { useContactPick } from "@/hooks/use-contact-pick";
import { vibrateIfEnabled } from "@/lib/motion-settings";

const TABS: { id: SendKind; label: string; icon: typeof SendIcon }[] = [
  { id: "send", label: "Send Money", icon: SendIcon },
  { id: "pochi", label: "Pochi La Biashara", icon: Store },
];

/**
 * Send Money / Pochi La Biashara - number + amount. The automation service
 * fills the *334# menus step by step; the PIN stays in the phone dialog.
 *
 * simKey pins the dial to the active wallet's SIM so the phone does not
 * show its call-SIM chooser; null lets the native bridge pick a line.
 */
export default function Send({ simKey }: { simKey?: string | null }) {
  const location = useLocation();
  const paramTab = new URLSearchParams(location.search).get("tab");
  const [tab, setTab] = useState<SendKind>(
    paramTab === "pochi" ? "pochi" : "send",
  );
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [touched, setTouched] = useState(false);
  const [favOpen, setFavOpen] = useState(false);
  // Clearing is safe only for the payment just made, not a random receipt
  // hours later.
  const startedAt = useRef(0);

  // The Pay menu can re-navigate to a ?tab= Send is already showing, so the
  // sync keys on location.key, which changes on every navigation: the menu
  // choice always wins over the mounted state.
  useEffect(() => {
    if (paramTab === "pochi" || paramTab === "send") setTab(paramTab);
  }, [location.key, location.search, paramTab]);

  useEffect(() => {
    const onTransaction = () => {
      if (Date.now() - startedAt.current > 180_000) return;
      setPhone("");
      setAmount("");
      setTouched(false);
    };
    window.addEventListener("mpesa:transactions", onTransaction);
    return () => window.removeEventListener("mpesa:transactions", onTransaction);
  }, []);
  const auto = useAutomationAvailable();
  const qe = useQuickEntry();
  const fav = useFavourites(tab);
  // A picked contact fills the number field; the star decides favourites.
  const contact = useContactPick((r) => {
    vibrateIfEnabled(8);
    setPhone(formatPhoneInput(r.phone ?? ""));
  });

  const phoneOk = normalizePhone(phone) !== "";
  const amountOk = isValidAmount(amount);
  const valid = phoneOk && amountOk;
  const busy =
    qe.status === "starting" ||
    qe.status === "step" ||
    qe.status === "awaiting-pin" ||
    qe.status === "awaiting-confirm";
  const interrupted = qe.status === "interrupted" || qe.status === "aborted";
  const favouriteSaved =
    phoneOk &&
    fav.favourites.some((f) => normalizePhone(f.phone) === normalizePhone(phone));
  const favouriteName = (name: string, number: string) =>
    name === number ? formatFavouritePhone(number) : name;

  function handleSend() {
    if (busy) return;
    setTouched(true);
    if (!valid) {
      toast.error("Enter a valid number and amount.");
      return;
    }
    const script = buildSendScript(tab, phone, amount);
    if (!script) {
      toast.error("Invalid details.");
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
    // From here on a dial happens, so this is the first point that may
    // prompt for CALL_PHONE - nothing before it (FAB, form, panel) asks.
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
    startedAt.current = Date.now();
    qe.start(script, simKey);
  }

  return (
    <div className="mx-auto w-full max-w-xl space-y-5">
      <PageHeader title="Send money" />

      {/* Top switcher: Send Money / Pochi */}
      <div
        className="grid grid-cols-2 gap-1 rounded-[10px] border bg-muted p-1"
        role="tablist"
      >
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-sm font-medium transition-colors",
              tab === id
                ? "bg-card text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </div>

      <FavouritesRow
        items={fav.favourites.map((f) => ({
          id: f.id,
          name: favouriteName(f.name, f.phone),
          active: isActiveFavourite(f, phone),
          onPick: () => {
            vibrateIfEnabled(8);
            setPhone(formatPhoneInput(f.phone));
          },
        }))}
        onManage={() => setFavOpen(true)}
      />

      <div className="space-y-1.5">
        <label
          htmlFor="send-phone"
          className="text-[13px] font-medium text-foreground"
        >
          Phone number
        </label>
        <div className="relative">
          <Input
            id="send-phone"
            inputMode="tel"
            autoComplete="tel"
            placeholder="07XX XXX XXX"
            value={phone}
            onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
            aria-invalid={touched && !phoneOk}
            className="h-11 rounded-xl pr-24 text-lg font-semibold tracking-wide tabular-nums"
          />
          {/* The system contact picker fills the field and nothing else:
              saving to favourites is the star's job. */}
          <button
            type="button"
            aria-label="Pick from contacts"
            onClick={contact.start}
            disabled={contact.picking}
            className="absolute right-12 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
          >
            {contact.picking ? (
              <Loader2 className="size-5 animate-spin" aria-hidden />
            ) : (
              <Contact className="size-5" aria-hidden />
            )}
          </button>
          <FavouriteStar
            saved={favouriteSaved}
            disabled={!phoneOk || fav.loading}
            label="Save to favourites"
            onClick={() => void fav.add("", normalizePhone(phone))}
          />
        </div>
        {touched && !phoneOk && (
          <span className="block text-xs text-destructive">
            Enter a valid Safaricom number (07.. / 01..).
          </span>
        )}
      </div>

      <AmountField
        id="send-amount"
        value={amount}
        onChange={setAmount}
        invalid={touched && !amountOk}
        error={
          touched && !amountOk
            ? "Enter an amount between 1 and 500,000."
            : undefined
        }
      />

      {interrupted ? (
        <AutomationInterruptedNotice
          code={qe.code ?? undefined}
          onDismiss={qe.dismiss}
        />
      ) : null}

      <Button
        className="min-h-11 w-full rounded-xl bg-pay-bg text-[15px] font-semibold text-pay-ink hover:opacity-90"
        onClick={handleSend}
        disabled={busy}
      >
        {valid
          ? `Send ${formatAmountInput(amount)} to ${phone}`
          : tab === "pochi"
            ? "Send to Pochi"
            : "Send money"}
      </Button>

      <AutomationStatusLine
        available={auto.available}
        running={auto.running}
        onRetry={auto.recheck}
      />

      <FavouritesSheet
        open={favOpen}
        onOpenChange={setFavOpen}
        title={
          tab === "send" ? "Send Money favourites" : "Pochi favourites"
        }
        favourites={fav.favourites}
        loading={fav.loading}
        picking={fav.picking}
        canPick={fav.canPick}
        defaultPhone={phoneOk ? normalizePhone(phone) : ""}
        onAdd={fav.add}
        onRename={fav.rename}
        onRemove={fav.remove}
        onReorder={fav.reorder}
        onPickContact={fav.pickFromContacts}
      />
    </div>
  );
}
