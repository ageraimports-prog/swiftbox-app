/**
 * NEEDS_PREALERT — THE one definition of "this package is in Miami and the
 * customer still has to pre-alert it". The admin owns the rule
 * (SwiftboxAdmin lib/prealert-needs.ts, PREALERT_PICK_PLAN.md); this is the same
 * two functions, kept byte-for-byte in step with it. Every list, count, form
 * and submit in this app goes through `needsPrealertSql` — no second copy.
 *
 *   received in Miami        a mod_packages row, dated on/after PREALERT_SINCE
 *   not manifested / on a    no mod_shipment row AND the legacy has-shipment
 *   shipment                 flag still 0
 *   no pre-alert linked      no mod_prealert / swiftbox_prealerts row for the
 *                            same customer with the same TRIM'd tracking — the
 *                            link the admin's pre-alert list uses
 *   belongs to a customer    user_id resolves to a users row of type 'member'
 *
 * The Play demo account is NOT excluded here (its packages must show). Literals
 * only, no bound parameters. Pure, so vitest can import it. MySQL 5.6.
 */

/** Packages received before this date were handled in the legacy system. */
export const PREALERT_SINCE = "2026-06-01";

function safeAlias(alias: string): string {
  if (!/^[a-z][a-z0-9_]*$/i.test(alias)) throw new Error("Invalid SQL alias");
  return alias;
}

/** TRUE when the package (`alias` = its mod_packages alias) has a linked pre-alert. */
export function hasPrealertSql(alias = "p"): string {
  const a = safeAlias(alias);
  return `(EXISTS (SELECT 1 FROM mod_prealert npa
                     WHERE npa.user_id = ${a}.user_id
                       AND LENGTH(TRIM(npa.tracking_number)) > 0
                       AND TRIM(npa.tracking_number) = TRIM(${a}.tracking))
        OR EXISTS (SELECT 1 FROM swiftbox_prealerts nsp
                     WHERE nsp.user_id = ${a}.user_id
                       AND LENGTH(TRIM(nsp.tracking_number)) > 0
                       AND TRIM(nsp.tracking_number) = TRIM(${a}.tracking)))`;
}

/**
 * The same link rule as hasPrealertSql, as a JOIN condition between a pre-alert
 * row (`pr`, either table) and a package (`p`): same customer, TRIM'd non-blank
 * tracking. Used where the pre-alert rows themselves are needed (the
 * admin's "Customer paid" gauge, lib/customer-paid.ts).
 */
export function prealertLinkOn(pr: string, p: string): string {
  const a = safeAlias(pr);
  const b = safeAlias(p);
  return `(${a}.user_id = ${b}.user_id
       AND LENGTH(TRIM(${a}.tracking_number)) > 0
       AND TRIM(${a}.tracking_number) = TRIM(${b}.tracking))`;
}

/** TRUE when the package needs a pre-alert from its customer. */
export function needsPrealertSql(alias = "p"): string {
  const a = safeAlias(alias);
  return `(${a}.user_id > 0
       AND EXISTS (SELECT 1 FROM users nu WHERE nu.id = ${a}.user_id AND nu.type = 'member')
       AND ${a}.date >= '${PREALERT_SINCE}'
       AND LENGTH(TRIM(${a}.tracking)) > 0
       AND ${a}.status = 0
       AND NOT EXISTS (SELECT 1 FROM mod_shipment nms WHERE nms.package_id = ${a}.pk_id)
       AND NOT ${hasPrealertSql(a)})`;
}
