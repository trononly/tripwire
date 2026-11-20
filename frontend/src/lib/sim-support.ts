import type { StatementMeta } from "../../bindings/mpesa-analyzer/internal/store/models";
import type { SimCard } from "@/lib/sms-bridge";

/**
 * Carriers whose wallet Tripwire can analyze. Names are matched on letters
 * and digits only, so "Safaricom" and a device's "Safaricom PLC" both land
 * here. Every other carrier the phone reports is still listed, but marked
 * unsupported.
 */
export const SUPPORTED_CARRIERS = ["safaricom"] as const;

export type CarrierSupport = "supported" | "unsupported" | "unknown";

function carrierKey(carrier: string | null | undefined): string {
  return (carrier ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * The one carrier rule, read by every wallet surface. An empty name is
 * "unknown" rather than "unsupported": the app cannot classify a SIM whose
 * carrier the platform did not report, and an existing M-Pesa wallet must
 * stay usable in that state.
 */
export function carrierSupport(
  carrier: string | null | undefined,
): CarrierSupport {
  const key = carrierKey(carrier);
  if (!key) return "unknown";
  return SUPPORTED_CARRIERS.some((name) => key.includes(name))
    ? "supported"
    : "unsupported";
}

/**
 * A wallet's display name. The bridge sends the carrier's own SIM name
 * ("Safaricom", "Airtel"); records written before SIMs were captured have
 * only the derived key, so fall back to "SIM <slot>".
 */
export function simName(meta: Pick<StatementMeta, "simId" | "simLabel">): string {
  const label = meta.simLabel?.trim();
  if (label) return label;
  const keyed = /^(?:sim|sub)-(\d+)$/.exec(meta.simId ?? "");
  if (keyed) {
    // Slot keys are zero-based; subscription keys are not, but a friendly
    // ordinal is the best either can offer when the carrier name is missing.
    return `SIM ${/^sim-/.test(meta.simId ?? "") ? Number(keyed[1]) + 1 : keyed[1]}`;
  }
  return "SIM";
}

/**
 * One row in the wallet list: a stored M-Pesa wallet, a SIM the phone
 * reports with no wallet behind it, or a stored wallet whose SIM also shows
 * up in the phone's current list. `meta` is null for the second kind, and
 * that row has no data to analyze.
 */
export interface SimWallet {
  key: string;
  name: string;
  support: CarrierSupport;
  number: string;
  meta: StatementMeta | null;
  txCount: number | null;
}

/**
 * A wallet is selectable only when it has M-Pesa data and its carrier is
 * not one Tripwire knows it cannot analyze. Both wallet surfaces read this
 * instead of repeating the condition.
 */
export function isSelectableWallet(
  wallet: Pick<SimWallet, "meta" | "support">,
): boolean {
  return wallet.meta !== null && wallet.support !== "unsupported";
}

/** Subtext under a wallet row: the number when usable, otherwise why it
 * cannot be picked. */
export function walletSubtext(
  wallet: Pick<SimWallet, "meta" | "support" | "number">,
): string {
  if (wallet.support === "unsupported") return "Not supported yet";
  if (!wallet.meta) return "No M-Pesa wallet";
  return wallet.number;
}

/**
 * Builds the wallet list from what the app knows: stored SMS wallets plus
 * every SIM the phone currently reports. Support comes from the phone's
 * carrier name, never from a wallet's label, because that label may be the
 * user's own SIM name.
 */
export function simWallets({
  metas,
  cards = [],
  numbers = {},
}: {
  metas: StatementMeta[];
  cards?: SimCard[];
  numbers?: Record<string, string>;
}): SimWallet[] {
  const cardsByKey = new Map<string, SimCard>();
  for (const card of cards) {
    if (card.slot >= 0) cardsByKey.set(`sim-${card.slot}`, card);
    if (card.subId >= 0) cardsByKey.set(`sub-${card.subId}`, card);
  }

  const wallets: SimWallet[] = [];
  const claimed = new Set<SimCard>();
  for (const meta of metas) {
    if (meta.source && meta.source !== "sms") continue;
    const simId = meta.simId?.trim() ?? "";
    const card = simId ? cardsByKey.get(simId) : undefined;
    if (card) claimed.add(card);
    wallets.push({
      key: simId || meta.id,
      name: simName(meta),
      support: carrierSupport(card?.carrier),
      number: numbers[simId] || card?.number?.trim() || "",
      meta,
      txCount: meta.txCount,
    });
  }

  for (const card of cards) {
    if (claimed.has(card)) continue;
    const key =
      card.slot >= 0
        ? `sim-${card.slot}`
        : card.subId >= 0
          ? `sub-${card.subId}`
          : "";
    if (!key) continue;
    claimed.add(card);
    wallets.push({
      key,
      name: card.simLabel.trim() || simName({ simId: key, simLabel: "" }),
      support: carrierSupport(card.carrier),
      number: card.number.trim() || numbers[key] || "",
      meta: null,
      txCount: null,
    });
  }

  return wallets;
}
