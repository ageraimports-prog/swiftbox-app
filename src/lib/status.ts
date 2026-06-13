/**
 * Customer-visible shipment progress: 5 stepper stages (0–4).
 *
 *   stage 0  In Miami            mod_shipment.miami_date
 *   stage 1  In Transit          mod_shipment.transit_date
 *   stage 2  Awaiting Clearance  mod_shipment.awaiting_date
 *   stage 3  Out for Delivery    mod_shipment.ofd_date
 *   stage 4  Delivered           mod_shipment.delivered_date
 *
 * DB `mod_shipment.ship_status` (0–5) → stage:
 *   no shipment row → 0   (package logged at Miami, not yet manifested)
 *   0 → 0   (manifested, no tracking update yet — still In Miami)
 *   1 → 1   2 → 2   3 → 3
 *   4 → 3   (unused in live data; clamped so it can't render as Delivered)
 *   5 → 4   (Delivered)
 *
 * Live data only contains ship_status 0 and 5.
 */

export type Stage = 0 | 1 | 2 | 3 | 4;

export type StageMeta = {
  label: string;
  /** mod_shipment date column for this stage (API field name). */
  dateField: "miamiDate" | "transitDate" | "awaitingDate" | "ofdDate" | "deliveredDate";
  /** Badge pill classes for the dark (ink) theme. */
  badge: string;
};

export const STAGES: StageMeta[] = [
  {
    label: "In Miami",
    dateField: "miamiDate",
    badge: "bg-sky-400/10 text-sky-300 border border-sky-400/25",
  },
  {
    label: "In Transit",
    dateField: "transitDate",
    badge: "bg-amber-400/10 text-amber-300 border border-amber-400/25",
  },
  {
    label: "Awaiting Clearance",
    dateField: "awaitingDate",
    badge: "bg-orange-400/10 text-orange-300 border border-orange-400/25",
  },
  {
    label: "Out for Delivery",
    dateField: "ofdDate",
    badge: "bg-violet-400/10 text-violet-300 border border-violet-400/25",
  },
  {
    label: "Delivered",
    dateField: "deliveredDate",
    badge: "bg-green/10 text-green border border-green/25",
  },
];

/** Map a raw DB ship_status (or null = no shipment row) to its stepper stage. */
export function shipStatusToStage(
  shipStatus: number | null | undefined
): Stage {
  const s = Number(shipStatus ?? 0);
  if (s <= 0) return 0;
  if (s >= 5) return 4;
  if (s === 4) return 3; // clamp unused value, never falsely "Delivered"
  return s as Stage;
}

export function stageMeta(shipStatus: number | null | undefined): StageMeta {
  return STAGES[shipStatusToStage(shipStatus)];
}

/** mod_packages.pk_type — 1 = AIR, 2 = SEA. */
export function freightLabel(pkType: number | null | undefined): string {
  if (Number(pkType) === 1) return "AIR";
  if (Number(pkType) === 2) return "SEA";
  return "—";
}
