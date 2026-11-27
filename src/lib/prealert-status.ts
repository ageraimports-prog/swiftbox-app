/**
 * The status on a pre-alert card (Pre-alerts page), pure.
 *
 * Before 27 Nov 2026 the card showed the pre-alert row's own stored
 * `swiftbox_prealerts.status` (pending / received / processed, written once when
 * the office matched it) and, for a matched package past customs, the lock line
 * "This package has already cleared customs…" — so a pre-alert whose package was
 * DELIVERED still read as a customs stage (Fatima Cummings SBX-0959: WR1881,
 * WR1791 delivered and on paid INV-000458).
 *
 * The rule now: once a pre-alert matches a package (same customer, same parcel —
 * tracking.ts `trackingsMatch`, the JS twin of the SQL link), its label IS that
 * package's customer-facing view, exactly as the package list shows it
 * (lib/package-views.ts). Nothing is copied or stored, so it follows the package
 * all the way to Out for Delivery and Delivered, and inherits every guard of the
 * shared rule (display floor, status-ahead cap, Consolidated Billing masking).
 * Several packages match one pre-alert (a split parcel) → the LEAST advanced one,
 * so the card is never ahead of any of them. Unmatched → unchanged (the stored
 * status, "Pending").
 */

import type { CustomerFacingView } from "./customer-facing-status-core";
import { trackingsMatch } from "./tracking";

export type PrealertPackage = { pkId: number; wr: string; tracking: string; status: CustomerFacingView };

export type PrealertCardStatus =
  | { matched: false }
  | { matched: true; status: CustomerFacingView; pkIds: number[]; wrs: string[] };

/** The packages a pre-alert's tracking links to, in the list's order. */
export function matchedPackages(tracking: string, packages: readonly PrealertPackage[]): PrealertPackage[] {
  if (!String(tracking ?? "").trim()) return [];
  return packages.filter((p) => trackingsMatch(p.tracking, tracking));
}

/** How far along a view is, for picking the least advanced: the bar step; a cancelled package counts as not started. */
function progressOf(v: CustomerFacingView): number {
  return v.cancelled ? -1 : v.stage;
}

export function prealertCardStatus(tracking: string, packages: readonly PrealertPackage[]): PrealertCardStatus {
  const hits = matchedPackages(tracking, packages);
  if (hits.length === 0) return { matched: false };
  let least = hits[0];
  for (const p of hits) if (progressOf(p.status) < progressOf(least.status)) least = p;
  return { matched: true, status: least.status, pkIds: hits.map((p) => p.pkId), wrs: hits.map((p) => p.wr) };
}

/**
 * The line under a locked card. The old line named a customs stage
 * ("already cleared customs"), which read as the package's status. The status is
 * the badge now; the line only says how to change the pre-alert.
 */
export const PREALERT_LOCKED_NOTE = "This pre-alert can no longer be changed here — message us on WhatsApp if something needs fixing.";
