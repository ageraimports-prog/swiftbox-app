/**
 * Customer-visible shipment progress: 5 stepper stages (0–4).
 *
 *   stage 0  In Miami            mod_shipment.miami_date
 *   stage 1  In Transit          mod_shipment.transit_date  ("to Piarco" for air)
 *   stage 2  Awaiting Clearance  mod_shipment.awaiting_date
 *   stage 3  Out for Delivery    mod_shipment.ofd_date
 *   stage 4  Delivered           mod_shipment.delivered_date
 *
 * DB `mod_shipment.ship_status` (0–5) → stage:
 *   no shipment row → 0   (package logged at Miami, not yet manifested)
 *   0 → 0   (manifested, no tracking update yet — still In Miami)
 *   1 → 0   2 → 1   3 → 2
 *   4 → 3   (Out for Delivery)
 *   5 → 4   (Delivered)
 *
 * Swiftbox's admin owns these stages; provider warehouse states are separate.
 */

import { inTransitLabel } from "./auto-transit-core";
import { CB_GROUP_STEP_LABELS, CB_STEP_LABELS, CLEARED_READY_LABEL, type CustomerFacingView } from "./customer-facing-status-core";

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
  if (!Number.isInteger(s) || s < 1 || s > 5) return 0;
  return (s - 1) as Stage;
}

/**
 * A stage's customer-facing wording. In Transit names where it is going: air
 * (and express) "In Transit to Piarco", sea plain "In Transit" — `freight` is
 * mod_packages.pk_type (1 AIR, 2 SEA); unknown reads as air.
 */
export function stageLabel(stage: Stage, freight?: number | null): string {
  return stage === 1 ? inTransitLabel(freight ?? 1) : STAGES[stage].label;
}

function withLabel(stage: Stage, freight?: number | null): StageMeta {
  return { ...STAGES[stage], label: stageLabel(stage, freight) };
}

export function stageMeta(shipStatus: number | null | undefined, freight?: number | null): StageMeta {
  return withLabel(shipStatusToStage(shipStatus), freight);
}

/** mod_packages.pk_type — 1 = AIR, 2 = SEA. */
export function freightLabel(pkType: number | null | undefined, mode?: string | null): string {
  if (mode === "express") return "EXPRESS";
  if (Number(pkType) === 1) return "AIR";
  if (Number(pkType) === 2) return "SEA";
  return "—";
}

/**
 * What the package APIs send as `status`: THE shared rule's answer
 * (customer-facing-status-core.ts, code-identical with the admin and the
 * website). Screens only render it — they never work a status out themselves.
 */
export type ShownStatus = CustomerFacingView;

/** Consolidated Billing's "Consolidating" (R13): never a stage or a place. */
export const CB_CONSOLIDATING_BADGE = "bg-violet-400/10 text-violet-300 border border-violet-400/25";

/** A notice the office set ("Delayed", "On hold — contact us"): highlighted, never a stage. */
export const NOTICE_BADGE = "bg-amber-400/15 text-amber-200 border border-amber-400/50";

/** Step 2 once ready: a Consolidated Billing member's Ready for delivery, or Cleared – Ready to Deliver. */
const CB_READY_BADGE = "bg-green/10 text-green border border-green/25";

/**
 * THE status badge, for every screen (package card, detail header): the shared
 * rule's label in its colour. `status` absent (an old response) → the stage.
 */
export function packageBadge(
  status: ShownStatus | null | undefined,
  shipStatus?: number | null,
  freight?: number | null
): { label: string; badge: string } {
  if (!status) return stageMeta(shipStatus, freight);
  if (status.notice) return { label: status.label, badge: NOTICE_BADGE };
  if (status.consolidating) return { label: status.label, badge: CB_CONSOLIDATING_BADGE };
  if (status.ready || (status.cb && !status.group && status.stage === 2)) return { label: status.label, badge: CB_READY_BADGE };
  return { label: status.label, badge: STAGES[status.stage].badge };
}

/** The stepper's labels: a Consolidated Billing member has its own steps (no transit, no clearance). */
export function stepLabels(status: ShownStatus | null | undefined, freight?: number | null): string[] {
  // After Send now a member shows its GROUP's real status (Brent, 2026-10-23) on
  // location-free steps: never Miami or Piarco for a consolidated package (2026-10-29).
  const labels = status?.cb ? [...(status.group ? CB_GROUP_STEP_LABELS : CB_STEP_LABELS)] : STAGES.map((_, i) => stageLabel(i as Stage, freight));
  // Invoice issued (Brent, 2026-10-19): step 2 is "Cleared – Ready to Deliver".
  if (status?.ready) labels[2] = CLEARED_READY_LABEL;
  return labels;
}
