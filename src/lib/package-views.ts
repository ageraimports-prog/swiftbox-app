import { query } from "@/lib/db";
import { airdropPackageColumns } from "@/lib/airdrop-display";
import { cbPackageFacts } from "@/lib/consolidated-billing";
import { CLEARANCE_FACTS_SQL, CLEARED_SQL, INVOICE_ISSUED_AT_SQL, consolidatedCustomerOn, customerDisplayFloors, customerStatusOverrides, viewFor } from "@/lib/customer-status";
import type { CustomerFacingView } from "@/lib/customer-facing-status-core";

/**
 * What the customer sees for every one of their packages — THE package list's
 * reading (GET /api/packages), lifted out so the pre-alert cards (GET
 * /api/prealerts) read the very same status and the two can never disagree
 * (Fatima Cummings SBX-0959, 27 Nov 2026: her pre-alerts said customs while the
 * package list said Delivered).
 *
 * The status is decided ONCE here, by the shared rule (customer-facing-status-core
 * via viewFor): office statuses, Consolidated Billing, the 5 pm drop, the issued
 * invoice, the never-backwards floor (swiftbox_package_display_status) and its
 * status-ahead cap (cbGroupShownRank). Nothing here re-derives a label.
 */

export type PackageViewRow = {
  pk_id: number;
  wr: string;
  external_code: string | null;
  external_mode: string | null;
  external_received_at: string | null;
  tracking: string;
  pk_type: number;
  weight: number;
  pcs: number;
  shipper: string;
  commodities: string;
  date: string;
  ship_no: string | null;
  ship_status: number | null;
  cleared: number | null;
  clearance_facts?: string | null;
  invoice_issued_at: string | null;
};

export type PackageView = { row: PackageViewRow; status: CustomerFacingView };

export type CustomerPackageViews = {
  /** Newest first, the package list's order. */
  packages: PackageView[];
  /** The customer's Consolidated Billing switch. */
  cbOn: boolean;
  /** Any package of theirs is in a Consolidated Billing group. */
  hasCbMembers: boolean;
};

export async function customerPackageViews(userId: number): Promise<CustomerPackageViews> {
  // ship_status is read raw (null = no shipment row); what the customer sees is
  // decided below by the shared rule.
  const rows = await query<PackageViewRow>(
    `SELECT p.pk_id, p.wr, p.tracking, p.pk_type, p.weight, p.pcs,
            p.shipper, p.commodities, p.date, ${await airdropPackageColumns()},
            s.ship_no, s.ship_status, ${CLEARED_SQL} AS cleared, ${CLEARANCE_FACTS_SQL} AS clearance_facts,
            ${INVOICE_ISSUED_AT_SQL} AS invoice_issued_at
       FROM mod_packages p
       LEFT JOIN mod_shipment s ON s.package_id = p.pk_id
      WHERE p.user_id = :userId
      ORDER BY p.date DESC, p.pk_id DESC`,
    { userId }
  );

  // Consolidated Billing membership and the office's status (display only),
  // each read on its own and never fatal.
  const cb = await cbPackageFacts(userId).catch(() => new Map());
  const cbOn = await consolidatedCustomerOn(userId);
  const ids = rows.map((r) => Number(r.pk_id));
  const overrides = await customerStatusOverrides(userId, ids);
  const floors = await customerDisplayFloors(userId, ids);
  const now = Date.now();

  const packages = rows.map((r) => {
    const raw = r.ship_status == null ? null : Number(r.ship_status);
    const status = viewFor({
      override: overrides.get(Number(r.pk_id)),
      rawShipStatus: raw,
      cleared: Number(r.cleared) > 0,
      clearanceFacts: r.clearance_facts,
      pkType: Number(r.pk_type),
      cb: cb.get(Number(r.pk_id))?.membership ?? null,
      airdrop: { receivedAt: r.external_received_at, mode: r.external_mode },
      invoiceIssuedAt: r.invoice_issued_at,
      displayFloor: floors.get(Number(r.pk_id)) ?? null,
      consolidatedCustomer: cbOn,
      nowMs: now,
    });
    return { row: r, status };
  });

  return { packages, cbOn, hasCbMembers: cb.size > 0 };
}
