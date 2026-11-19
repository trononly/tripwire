import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { interruptedCopy } from "@/lib/automation-status";
import { isAndroidBridge, openUssdAutomationSettings } from "@/lib/sms-bridge";

/** Automation is switched off in Android Accessibility settings. */
export function AutomationOffPanel() {
	if (!isAndroidBridge()) {
		return (
			<p className="text-sm text-muted-foreground">
				Guided M-Pesa payments are available in the Android app.
			</p>
		);
	}
	return (
		<div
			role="alert"
			className="space-y-3 border border-amber-500/40 bg-amber-500/10 p-4"
		>
			<div className="flex items-start gap-2">
				<TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
				<div>
					<p className="text-sm font-medium">Automation is off</p>
					<p className="text-xs text-muted-foreground">
						Enable it in Android Accessibility settings so Tripwire can fill
						the M-Pesa menus. Your PIN still stays in the phone dialog.
					</p>
				</div>
			</div>
			<Button onClick={openUssdAutomationSettings}>Enable automation</Button>
		</div>
	);
}

export function AutomationDisconnectedPanel({
	onRetry,
	compact = false,
}: {
	onRetry: () => void;
	compact?: boolean;
}) {
	return (
		<div
			role="alert"
			className={
				compact
					? "space-y-2.5 border border-amber-500/40 bg-amber-500/10 p-3"
					: "space-y-3 border border-amber-500/40 bg-amber-500/10 p-4"
			}
		>
			<div className="flex items-start gap-2.5">
				<TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
				<div className="space-y-1">
					<p className="text-sm font-medium">
						Automation is enabled, but not connected
					</p>
					<p className="text-xs leading-relaxed text-muted-foreground">
						Android hasn&rsquo;t connected the automation service. Another
						app or system tool controlling your screen may be interfering.
					</p>
				</div>
			</div>
			<div className="flex flex-wrap gap-2">
				<Button size="sm" onClick={onRetry}>
					Retry connection
				</Button>
				<Button
					variant="outline"
					size="sm"
					onClick={openUssdAutomationSettings}
				>
					Open Accessibility settings
				</Button>
			</div>
			<details className="text-xs text-muted-foreground">
				<summary className="cursor-pointer select-none">
					Still not connected?
				</summary>
				<div className="mt-2 space-y-1.5">
					<p>
						Turn Tripwire off and on in Accessibility settings, then return
						here. If that doesn&rsquo;t help, restart the phone.
					</p>
					<p>
						Close any app that is controlling or recording your screen before
						trying again.
					</p>
				</div>
			</details>
		</div>
	);
}

export function AutomationStatusLine({
	available,
	running,
	onRetry,
}: {
	available: boolean;
	running: boolean;
	onRetry: () => void;
}) {
	if (!isAndroidBridge()) {
		return (
			<p className="text-center text-xs text-muted-foreground">
				Guided M-Pesa payments are available in the Android app.
			</p>
		);
	}
	if (!available) {
		return (
			<p className="flex flex-wrap justify-center gap-x-1.5 text-center text-xs text-muted-foreground">
				Automation is off, so Tripwire can&rsquo;t fill the menus.
				<button
					type="button"
					onClick={openUssdAutomationSettings}
					className="font-medium text-foreground underline underline-offset-2"
				>
					Open settings
				</button>
			</p>
		);
	}
	if (!running) {
		return (
			<p className="flex flex-wrap justify-center gap-x-1.5 text-center text-xs text-muted-foreground">
				Automation is on, but Android hasn&rsquo;t connected it yet.
				<button
					type="button"
					onClick={onRetry}
					className="font-medium text-foreground underline underline-offset-2"
				>
					Retry
				</button>
				<button
					type="button"
					onClick={openUssdAutomationSettings}
					className="font-medium text-foreground underline underline-offset-2"
				>
					Open settings
				</button>
			</p>
		);
	}
	return (
		<p className="text-center text-xs text-muted-foreground">
			Tripwire dials *334# and fills the menus for you. You confirm with your
			PIN as usual.
		</p>
	);
}

export function AutomationInterruptedNotice({
	code,
	onDismiss,
}: {
	code?: string;
	onDismiss: () => void;
}) {
	const copy = interruptedCopy(code);
	return (
		<div
			role="alert"
			className="space-y-2 border border-amber-500/40 bg-amber-500/10 p-3"
		>
			<div className="flex items-start gap-2.5">
				<TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
				<div className="space-y-1">
					<p className="text-sm font-medium">{copy.title}</p>
					<p className="text-xs leading-relaxed text-muted-foreground">
						{copy.body}
					</p>
				</div>
			</div>
			<Button variant="outline" size="sm" onClick={onDismiss}>
				Dismiss
			</Button>
		</div>
	);
}
