/**
 * The 5 pm "In Transit" rule — PURE (no imports, no I/O).
 *
 * THIS FILE IS CODE-IDENTICAL IN THREE REPOS: SwiftboxApp
 * `src/lib/auto-transit-core.ts`, SwiftboxAdmin `lib/auto-transit-core.ts` and
 * the website's `src/lib/auto-transit-core.ts`. Change all three together.
 *
 * THE RULE (Brent, 2026-10-08). The Hialeah warehouse (Airdrop) drops packages
 * at the airport on WEEKDAYS. Everything Airdrop received up to 5:00 pm
 * TRINIDAD time on a drop day goes on the NEXT drop day's 5:00 pm drop, and
 * from then the customer sees "In Transit to Piarco":
 *
 *   received Mon 10:00 → Mon 5 pm cut-off → In Transit Tue 5:00 pm
 *   received Mon 18:00 → Tue 5 pm cut-off → In Transit Wed 5:00 pm
 *   received Thu 18:00 → Fri 5 pm cut-off → In Transit Mon 5:00 pm
 *   received Fri 18:00 / Sat / Sun → Mon 5 pm cut-off → In Transit Tue 5:00 pm
 *
 * A package received at exactly 5:00 pm belongs to the NEXT window.
 * Trinidad is UTC−4 all year (no daylight saving), so the offset is fixed.
 * Public holidays are not known to this rule.
 *
 * DISPLAY ONLY. Nothing is written: mod_shipment.ship_status, stage dates,
 * customs, invoices and delivery never see it. It applies only to packages
 * Airdrop received (their exact receive time is in the synced snapshot), only
 * to AIR and EXPRESS (sea does not go to Piarco), only while the real stage is
 * still In Miami, never to a package in an unreleased Consolidated Billing
 * group (R13), and a "Delayed" / "On hold" the office set wins over it. The
 * merge lives in customer-status-core.ts (`customerStatusView`).
 */

/** Trinidad and Tobago: UTC−4, no daylight saving. */
export const TT_OFFSET_MS = -4 * 60 * 60 * 1000;

/** The daily drop / cut-off hour, Trinidad time. */
export const DROP_HOUR_TT = 17;

/** Airdrop transport modes the rule applies to. Sea does not fly to Piarco. */
export const AUTO_TRANSIT_MODES: readonly string[] = ["air", "express"];

const DAY_MS = 24 * 60 * 60 * 1000;

/** Mon–Fri. `dow` is 0 = Sunday … 6 = Saturday. */
export function isDropDay(dow: number): boolean {
  return dow >= 1 && dow <= 5;
}

/** The first weekday 5:00 pm (Trinidad) STRICTLY after `ms`, as epoch ms. */
export function nextDropAfter(ms: number): number {
  const local = ms + TT_OFFSET_MS; // shift so UTC getters read Trinidad wall time
  const d = new Date(local);
  let candidate = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), DROP_HOUR_TT);
  if (candidate <= local) candidate += DAY_MS;
  while (!isDropDay(new Date(candidate).getUTCDay())) candidate += DAY_MS;
  return candidate - TT_OFFSET_MS;
}

/** Parse an ISO receive time; null when missing or unreadable. */
export function parseReceivedAt(receivedAt: string | null | undefined): number | null {
  if (typeof receivedAt !== "string" || !receivedAt.trim()) return null;
  const ms = Date.parse(receivedAt.trim());
  return Number.isFinite(ms) ? ms : null;
}

/** Does the rule cover this Airdrop transport mode? */
export function autoTransitApplies(mode: string | null | undefined): boolean {
  return typeof mode === "string" && AUTO_TRANSIT_MODES.includes(mode.trim().toLowerCase());
}

/**
 * When the customer starts seeing In Transit (epoch ms): the drop AFTER the
 * cut-off that closes the package's window. Null when the rule does not apply.
 */
export function autoTransitAt(receivedAt: string | null | undefined, mode: string | null | undefined): number | null {
  if (!autoTransitApplies(mode)) return null;
  const ms = parseReceivedAt(receivedAt);
  if (ms == null) return null;
  return nextDropAfter(nextDropAfter(ms));
}

/** Has the package's 5 pm drop passed? */
export function isAutoTransitDue(
  receivedAt: string | null | undefined,
  mode: string | null | undefined,
  nowMs: number
): boolean {
  const at = autoTransitAt(receivedAt, mode);
  return at != null && nowMs >= at;
}

/**
 * The customer-facing In Transit wording. `mod_packages.pk_type`: 1 = AIR
 * (express travels as air), 2 = SEA. Air lands at Piarco; sea keeps the plain
 * wording.
 */
export const IN_TRANSIT_AIR_LABEL = "In Transit to Piarco";
export const IN_TRANSIT_PLAIN_LABEL = "In Transit";

export function inTransitLabel(pkType: number | string | null | undefined): string {
  return Number(pkType) === 2 ? IN_TRANSIT_PLAIN_LABEL : IN_TRANSIT_AIR_LABEL;
}

/** "Tue 13 Oct, 5:00 pm" in Trinidad time — for the office's screens. */
export function ttDropLabel(ms: number): string {
  const d = new Date(ms + TT_OFFSET_MS);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const h = d.getUTCHours();
  const hh = h % 12 === 0 ? 12 : h % 12;
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${days[d.getUTCDay()]} ${d.getUTCDate()} ${months[d.getUTCMonth()]}, ${hh}:${mm} ${h < 12 ? "am" : "pm"}`;
}

/**
 * SQL expression for the Airdrop receive time of the `swiftbox_airdrop_packages`
 * row aliased `a` (MySQL 5.6 has no JSON functions; the snapshot is the synced
 * Airdrop record and carries "received_at" exactly once).
 */
export function airdropReceivedAtSql(a = "a"): string {
  return `SUBSTRING_INDEX(SUBSTRING_INDEX(${a}.snapshot, '"received_at":"', -1), '"', 1)`;
}
