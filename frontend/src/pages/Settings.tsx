import { useTheme } from "next-themes";
import { Link } from "react-router-dom";
import { ArrowRight, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  HAPTICS_KEY,
  REDUCE_MOTION_KEY,
  setSetting,
  useHapticsEnabled,
  useReduceMotionEnabled,
} from "@/lib/motion-settings";
import { setPrivacyMode, usePrivacyMode } from "@/lib/privacy-mode";
import { SMS_AUTO_PAUSED_KEY } from "@/lib/sms-state";
import {
  setAutoConfirmEnabled,
  useAutoConfirmEnabled,
} from "@/lib/payment-settings";
import { cn } from "@/lib/utils";
import { simName } from "@/components/sim-switcher";
import { useDevMode } from "@/hooks/use-konami-code";
import { restart as restartOnboarding } from "@/lib/onboarding-state";
import {
  drainPendingSms,
  hasPhoneStatePermission,
  isAndroidBridge,
  isIgnoringBatteryOptimizations,
  openAppSettings,
  openBatterySettings,
  openUssdAutomationSettings,
  ussdAutomationEnabled,
  type SmsPermissions,
} from "@/lib/sms-bridge";
import { SODA_URL, openExternalUrl } from "@/lib/external-url";
import type * as store from "../../bindings/mpesa-analyzer/internal/store/models";
import type { Updater } from "@/hooks/use-updater";
import { ChangelogButton } from "@/components/changelog-dialog";
import { BackupSetting } from "@/components/backup-setting";
import { AutomationSettingsCard } from "@/components/automation-settings";
import { ResetData } from "../../bindings/mpesa-analyzer/parseservice";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { OptionButton } from "@/components/ui/option-button";
import { Switch } from "@/components/ui/switch";

/**
 * Settings as one quiet list: grouped rows in two cards, then the cards
 * that own their own state (automation, backup, wallets), reset, and a
 * footnote. Every control keeps its behaviour; only the grouping and the
 * styling changed.
 */

const themes = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
] as const;

/** One row of the quiet list: label and subtext left, control right. */
function SettingRow({
  label,
  sub,
  children,
}: {
  label: string;
  sub?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="text-sm">{label}</p>
        {sub && (
          <p className="mt-0.5 text-[12px] text-muted-foreground">{sub}</p>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
        {children}
      </div>
    </div>
  );
}

function ThemeSegment() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="inline-flex overflow-hidden rounded-[10px] border border-border">
      {themes.map(({ value, label }) => (
        <OptionButton
          key={value}
          selected={theme === value}
          onClick={() => setTheme(value)}
          className="rounded-none border-0 px-2.5 py-1.5 text-[13px]"
        >
          {label}
        </OptionButton>
      ))}
    </div>
  );
}

/** Android only: which dataset the analysis runs over. Statements show the
 * PDF history; SMS shows the phone's imported M-Pesa messages. */
function ModeSegment({
  mode,
  onModeChange,
}: {
  mode: "statements" | "sms";
  onModeChange: (mode: "statements" | "sms") => void;
}) {
  const options = [
    { value: "statements" as const, label: "Statements" },
    { value: "sms" as const, label: "SMS" },
  ];

  return (
    <div className="inline-flex overflow-hidden rounded-[10px] border border-border">
      {options.map(({ value, label }) => (
        <OptionButton
          key={value}
          selected={mode === value}
          onClick={() => onModeChange(value)}
          className="rounded-none border-0 px-2.5 py-1.5 text-[13px]"
        >
          {label}
        </OptionButton>
      ))}
    </div>
  );
}

function MotionRows() {
  const reduceMotion = useReduceMotionEnabled();
  const haptics = useHapticsEnabled();
  const toggle = (on: boolean, key: string, label: string) => (
    <Switch
      checked={on}
      onCheckedChange={(next) => setSetting(key, next)}
      label={label}
    />
  );
  return (
    <>
      <SettingRow label="Reduce motion" sub="Stops pulses and slides">
        {toggle(reduceMotion, REDUCE_MOTION_KEY, "Reduce motion")}
      </SettingRow>
      <SettingRow label="Haptic feedback">
        {toggle(haptics, HAPTICS_KEY, "Haptic feedback")}
      </SettingRow>
    </>
  );
}

/** Privacy Mode: blurs every balance figure behind a tap-to-reveal veil. */
function PrivacyRow() {
  const on = usePrivacyMode();
  return (
    <SettingRow label="Privacy mode" sub="Blurs balances until you tap them.">
      <Switch
        checked={on}
        onCheckedChange={(next) => setPrivacyMode(next)}
        label="Privacy mode"
      />
    </SettingRow>
  );
}

/**
 * Debug: fire each system-settings jump and show what the device reports.
 * Both settings can only change while the app is in the background, so the
 * rows re-read on return.
 */
function SettingsJumps() {
  const [batteryExempt, setBatteryExempt] = useState(
    isIgnoringBatteryOptimizations,
  );
  const [accessibilityOn, setAccessibilityOn] = useState(
    ussdAutomationEnabled,
  );

  useEffect(() => {
    const recheck = () => {
      setBatteryExempt(isIgnoringBatteryOptimizations());
      setAccessibilityOn(ussdAutomationEnabled());
    };
    window.addEventListener("focus", recheck);
    document.addEventListener("visibilitychange", recheck);
    return () => {
      window.removeEventListener("focus", recheck);
      document.removeEventListener("visibilitychange", recheck);
    };
  }, []);

  const rows: {
    label: string;
    state?: string;
    opened: string;
    open: () => void;
  }[] = [
    {
      label: "Battery exemption",
      state: batteryExempt ? "exempt" : "not exempt",
      opened: "Battery settings opened",
      open: openBatterySettings,
    },
    {
      label: "Accessibility service",
      state: accessibilityOn ? "enabled" : "off",
      opened: "Accessibility settings opened",
      open: openUssdAutomationSettings,
    },
    {
      label: "App info",
      opened: "App info opened",
      open: openAppSettings,
    },
  ];

  return (
    <div className="divide-y divide-border">
      {rows.map(({ label, state, opened, open }) => (
        <SettingRow key={label} label={label}>
          {state && (
            <span className="font-mono text-xs text-muted-foreground">
              {state}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            aria-label={`Test ${label}`}
            onClick={() => {
              open();
              toast.success(opened);
            }}
          >
            Test
          </Button>
        </SettingRow>
      ))}
    </div>
  );
}

export default function Settings({
  mode,
  onModeChange,
  isAndroid,
  smsPermissions,
  statements,
  statementTxCount,
  smsTxCount,
  activeSmsId,
  onSwitchSim,
  numbers,
  onRefreshSimNames,
  onRequestSimNames,
  onTestArrival,
  updater,
}: {
  mode: "statements" | "sms";
  onModeChange: (mode: "statements" | "sms") => void;
  isAndroid: boolean;
  smsPermissions: SmsPermissions;
  statements: store.StatementMeta[];
  statementTxCount: number;
  smsTxCount: number;
  /** SMS record currently feeding SMS mode; null when none loaded. */
  activeSmsId: string | null;
  /** Switch SMS mode to another SIM's wallet. */
  onSwitchSim: (meta: store.StatementMeta) => void;
  /** Phone numbers by SIM key, shown as subtext when set. */
  numbers: Record<string, string>;
  /** Re-resolve carrier names when phone-state access is granted. */
  onRefreshSimNames: () => void;
  /** Ask for phone-state access (SIM names/numbers). Tap-only. */
  onRequestSimNames: () => void;
  /** Debug-only: replay the arrival announcement without moving money. */
  onTestArrival: () => void;
  updater: Updater;
}) {
  const debug = useDevMode();
  const autoConfirm = useAutoConfirmEnabled();
  const smsRecords = statements.filter((s) => s.source === "sms");
  const statementRecords = statements.filter((s) => s.source !== "sms");
  // Opening Settings re-resolves carrier names for wallets imported
  // without phone-state access - but only when that access is already
  // granted. Read-only: never prompts.
  useEffect(() => {
    onRefreshSimNames();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Phone-state grant state behind the "Show SIM names" opt-in. Rechecks
  // on return from the permission prompt so the button hides itself.
  const [phoneState, setPhoneState] = useState(hasPhoneStatePermission);
  useEffect(() => {
    const recheck = () => setPhoneState(hasPhoneStatePermission());
    window.addEventListener("focus", recheck);
    document.addEventListener("visibilitychange", recheck);
    return () => {
      window.removeEventListener("focus", recheck);
      document.removeEventListener("visibilitychange", recheck);
    };
  }, []);
  const bridge = isAndroidBridge();
  const grantLabel = (granted: boolean) =>
    !bridge ? "n/a" : granted ? "granted" : "not granted";
  const updatesSub = `${updater.current ? `Tripwire ${updater.current} installed` : "Tripwire"}${
    updater.status === "checking"
      ? " - checking…"
      : updater.status === "available" && updater.release
        ? ` - ${updater.release.version} ready`
        : updater.status === "up-to-date"
          ? " - you're up to date"
          : ""
  }`;
  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="divide-y divide-border">
          <SettingRow label="Appearance">
            <ThemeSegment />
          </SettingRow>
          <MotionRows />
          <PrivacyRow />
        </CardContent>
      </Card>

      {isAndroid && (
        <Card>
          <CardContent className="divide-y divide-border">
            <SettingRow
              label="Data source"
              sub="PDF statements, or this phone's M-Pesa inbox."
            >
              <ModeSegment mode={mode} onModeChange={onModeChange} />
            </SettingRow>
            {debug.unlocked && (
              <SettingRow label="SMS import details">
                <Link
                  to="/sms"
                  className="flex items-center gap-1 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
                  aria-label="Open SMS import details"
                >
                  Details
                  <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              </SettingRow>
            )}
            <SettingRow label="Auto-confirm after PIN">
              <Switch
                checked={autoConfirm}
                onCheckedChange={setAutoConfirmEnabled}
                label="Auto-confirm after PIN"
              />
            </SettingRow>
            <SettingRow label="App updates" sub={updatesSub}>
              <Button
                variant="outline"
                size="sm"
                onClick={() => updater.check(true)}
                disabled={updater.status === "checking"}
              >
                {updater.status === "checking"
                  ? "Checking…"
                  : "Check for updates"}
              </Button>
              <ChangelogButton />
              {updater.status === "available" && updater.release && (
                <Button size="sm" onClick={updater.reopen}>
                  View update
                </Button>
              )}
            </SettingRow>
            {updater.status === "error" && updater.error && (
              <p className="py-3 text-sm text-destructive">{updater.error}</p>
            )}
          </CardContent>
        </Card>
      )}

      {isAndroid && <AutomationSettingsCard />}

      <BackupSetting />

      {isAndroid && smsRecords.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Wallets</CardTitle>
            <CardDescription>
              One wallet per SIM. Switching keeps balances and cashflow from
              different wallets apart.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {smsRecords.map((sim) => {
              const isActive = sim.id === activeSmsId;
              const number = numbers[sim.simId ?? ""];
              return (
                <button
                  key={sim.id}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => onSwitchSim(sim)}
                  className={cn(
                    "flex w-full min-w-0 items-center gap-3 rounded-none border p-3 text-left transition-colors hover:bg-muted/50",
                    isActive && "border-primary/50 bg-primary/10",
                  )}
                >
                  <Smartphone
                    className={cn(
                      "size-5 shrink-0",
                      isActive ? "text-foreground" : "text-muted-foreground",
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {simName(sim)}
                    </span>
                    {number && (
                      <span className="block truncate text-[12px] text-muted-foreground tabular-nums">
                        {number}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-[12px] text-muted-foreground tabular-nums">
                    {sim.txCount.toLocaleString()} txs
                  </span>
                </button>
              );
            })}
            {!phoneState && (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={onRequestSimNames}
              >
                <Smartphone />
                Show SIM names
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <ResetSetting />

      {debug.unlocked && (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle>Debug</CardTitle>
            <CardDescription>
              Hidden diagnostics. Nothing here leaves the device.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="space-y-1.5 font-mono text-xs">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Platform</dt>
                <dd>{isAndroid ? "Android" : "Desktop"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Read SMS</dt>
                <dd>{grantLabel(smsPermissions.read)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Receive SMS</dt>
                <dd>{grantLabel(smsPermissions.receive)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Call phone</dt>
                <dd>{grantLabel(smsPermissions.call)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Data mode</dt>
                <dd>{mode}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Statements</dt>
                <dd>
                  {statementRecords.length} records ·{" "}
                  {statementTxCount.toLocaleString()} txs loaded
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">SMS imports</dt>
                <dd>
                  {smsRecords.length} records · {smsTxCount.toLocaleString()}{" "}
                  txs loaded
                </dd>
              </div>
            </dl>
            {isAndroid && (
              <Button
                variant="outline"
                size="sm"
                onClick={onTestArrival}
                className="mt-3"
              >
                Test arrival announcement
              </Button>
            )}
            <div className="mt-4 border-t border-border">
              <SettingRow
                label="Restart onboarding session"
                sub="Replays the tour from the first step."
              >
                <Button
                  variant="outline"
                  size="sm"
                  onClick={restartOnboarding}
                >
                  Restart
                </Button>
              </SettingRow>
            </div>
            {isAndroid && (
              <div className="mt-4 border-t border-border">
                <p className="pt-3 text-[12px] font-medium text-muted-foreground">
                  Settings jumps
                </p>
                <SettingsJumps />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <p className="px-1 text-[12px] leading-relaxed text-muted-foreground">
        Tripwire is free and open source, and if it saves you money you can{" "}
        <button
          type="button"
          onClick={() => openExternalUrl(SODA_URL)}
          className="underline underline-offset-2 transition-colors hover:text-foreground"
        >
          buy me a soda
        </button>
        .
      </p>
    </div>
  );
}

/** Destructive escape hatch: wipe the store if the data has gone bad. */
function ResetSetting() {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  async function reset() {
    if (!confirm) {
      setConfirm(true);
      return;
    }
    setBusy(true);
    try {
      await ResetData();
      // Drop messages the catcher queued before the reset; otherwise the
      // launch drain would merge them into the fresh store on reload.
      drainPendingSms();
      try {
        const keys: string[] = [];
        for (let i = 0; i < localStorage.length; i += 1) {
          const key = localStorage.key(i);
          if (key && (key.startsWith("mpesa-analyzer.") || key === "theme")) {
            keys.push(key);
          }
        }
        keys.forEach((key) => localStorage.removeItem(key));
        // Android does not let an app revoke its own runtime permissions.
        // The reset still gives an empty app: automatic full-inbox reads
        // stay paused until the user taps Import SMS, so the phone's old
        // history does not pour straight back into the fresh store.
        localStorage.setItem(SMS_AUTO_PAUSED_KEY, "1");
      } catch {
        /* private mode: the store reset still happened */
      }
      window.location.reload();
    } catch {
      setBusy(false);
      toast.error("Could not reset the app.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reset app</CardTitle>
        <CardDescription>
          Deletes statements, SMS imports, favourites, categories and recurring
          payments. Your settings reset too. Save a backup first if you may
          want this data back. This cannot be undone.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          variant={confirm ? "destructive" : "outline"}
          onClick={reset}
          disabled={busy}
        >
          {busy
            ? "Erasing…"
            : confirm
              ? "Confirm erase"
              : "Reset app"}
        </Button>
      </CardContent>
    </Card>
  );
}
