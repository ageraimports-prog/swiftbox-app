/**
 * "Customs values are already set" for a package — the SQL half of the
 * customer's pre-alert lock (prealert-edit-core.ts `isCustomerLocked`).
 *
 * The SAME test the admin uses (SwiftboxAdmin lib/prealert-edit.ts
 * `linkedPackagesFor`, built on lib/customer-paid.ts `isShipmentOpenForValues`
 * and lib/clearance.ts): a package is SET when
 *   - its shipment has a swiftbox_shipment_clearance row (cleared), or
 *   - it is on an invoice (swiftbox_invoice_packages, joined to its header), or
 *   - its shipment is invoiced: an invoice on the ship_no, or on any package of
 *     that ship_no.
 * Change it there and here together.
 *
 * The pre-alert ↔ package link is the usual one (prealert-needs.ts): same
 * user_id, TRIM'd non-blank tracking. Literals only, no bound parameters.
 * Pure, so vitest can import it. MySQL 5.6: correlated subqueries only.
 */

function safeAlias(alias: string): string {
  if (!/^[a-z][a-z0-9_]*$/i.test(alias)) throw new Error("Invalid SQL alias");
  return alias;
}

/** TRUE when package `pk` (a mod_packages alias) has its shipment cleared. */
export function packageClearedSql(pk: string): string {
  const a = safeAlias(pk);
  return `EXISTS (SELECT 1 FROM mod_shipment lcs
                    JOIN swiftbox_shipment_clearance lcc ON lcc.ship_no = lcs.ship_no
                   WHERE lcs.package_id = ${a}.pk_id)`;
}

/** TRUE when package `pk` is invoiced, or its shipment is (any lifecycle). */
export function packageInvoicedSql(pk: string): string {
  const a = safeAlias(pk);
  return `(EXISTS (SELECT 1 FROM swiftbox_invoice_packages lip
                     JOIN swiftbox_invoices li ON li.invoice_id = lip.invoice_id
                    WHERE lip.pk_id = ${a}.pk_id)
        OR EXISTS (SELECT 1 FROM mod_shipment lis
                     JOIN swiftbox_invoices li2 ON li2.ship_no = lis.ship_no
                    WHERE lis.package_id = ${a}.pk_id)
        OR EXISTS (SELECT 1 FROM mod_shipment lis2
                     JOIN mod_shipment lis3 ON lis3.ship_no = lis2.ship_no
                     JOIN swiftbox_invoice_packages lip2 ON lip2.pk_id = lis3.package_id
                     JOIN swiftbox_invoices li3 ON li3.invoice_id = lip2.invoice_id
                    WHERE lis2.package_id = ${a}.pk_id))`;
}

/** The link from pre-alert `sp` to package `pk`. */
function linkOn(sp: string, pk: string): string {
  return `(${pk}.user_id = ${sp}.user_id
       AND LENGTH(TRIM(${sp}.tracking_number)) > 0
       AND TRIM(${pk}.tracking) = TRIM(${sp}.tracking_number))`;
}

/** TRUE when pre-alert `sp` matches at least one package. */
export function prealertMatchedSql(sp: string): string {
  const a = safeAlias(sp);
  return `EXISTS (SELECT 1 FROM mod_packages lmp WHERE ${linkOn(a, "lmp")})`;
}

/** TRUE when pre-alert `sp` matches a package whose customs values are set — LOCKED. */
export function prealertLockedSql(sp: string): string {
  const a = safeAlias(sp);
  return `EXISTS (SELECT 1 FROM mod_packages llp
                   WHERE ${linkOn(a, "llp")}
                     AND (${packageClearedSql("llp")} OR ${packageInvoicedSql("llp")}))`;
}
