import { useEffect, useRef, useState } from "react";
import { Check, Smartphone } from "lucide-react";

import { cn } from "@/lib/utils";
import type { StatementMeta } from "../../bindings/mpesa-analyzer/internal/store/models";
import {
  isSelectableWallet,
  walletSubtext,
  type SimWallet,
} from "@/lib/sim-support";
import { Button } from "@/components/ui/button";

/**
 * SIM switcher for SMS mode. The list is every stored SMS wallet plus every
 * SIM the phone reports, so an unsupported carrier is visible instead of
 * silently absent. Only a wallet with M-Pesa data on a supported carrier is
 * selectable; the rest are listed disabled with a plain reason.
 *
 * Deliberately not a portaled menu: the list renders in place under the
 * header button so it can never cover or displace the header on small
 * screens.
 */
export function SimSwitcher({
  wallets,
  activeId,
  onSwitch,
}: {
  wallets: SimWallet[];
  activeId: string | null;
  onSwitch: (meta: StatementMeta) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open ]);

  if (wallets.length < 2) return null;

  const active =
    wallets.find((w) => w.meta?.id === activeId) ??
    wallets.find(isSelectableWallet);
  // Nothing to switch between without an active wallet, which only a
  // selectable entry can become.
  if (!active) return null;

  return (
    <div ref={rootRef} className="relative">
      <Button
        size="sm"
        variant="outline"
        aria-label={`Wallet SIM: ${active.name}`}
        aria-expanded={open}
        title="Switch M-Pesa wallet SIM"
        onClick={() => setOpen((v) => !v)}
      >
        <Smartphone />
        <span className="max-w-24 truncate sm:max-w-none">
          {active.name}
        </span>
      </Button>
      {open && (
        <div
          role="menu"
          aria-label="M-Pesa wallet"
          className="absolute top-full right-0 z-50 mt-2 w-52 overflow-hidden rounded-md border bg-popover shadow-md"
        >
          <p className="px-3 pt-2 pb-1 text-xs font-medium text-muted-foreground">
            M-Pesa wallet
          </p>
          {wallets.map((wallet) => {
            const selectable = isSelectableWallet(wallet);
            const isActive = wallet.meta?.id === activeId;
            const note = walletSubtext(wallet);
            return (
              <button
                key={wallet.key}
                type="button"
                role="menuitem"
                disabled={!selectable}
                onClick={() => {
                  if (!wallet.meta) return;
                  setOpen(false);
                  onSwitch(wallet.meta);
                }}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
                  selectable
                    ? "hover:bg-accent"
                    : "cursor-default text-muted-foreground",
                  isActive && "font-medium",
                )}
              >
                <Smartphone
                  className={cn(
                    "size-4 shrink-0",
                    isActive ? "opacity-100" : "opacity-40",
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block truncate",
                      !selectable && "opacity-60",
                    )}
                  >
                    {wallet.name}
                  </span>
                  {note && (
                    <span className="block truncate text-xs text-muted-foreground tabular-nums">
                      {note}
                    </span>
                  )}
                </span>
                {selectable && wallet.txCount !== null && (
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {wallet.txCount.toLocaleString()}
                  </span>
                )}
                {isActive && <Check className="size-4 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
