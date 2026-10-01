/**
 * The Buy For Me on/off switch — pure part (unit-tested in bfm-switch.test.ts).
 * The server reader is src/lib/bfm-switch.ts.
 *
 * PAUSED 2026-10-01 (Brent: no USD available to buy goods for customers). A
 * PAUSE, not a removal: every page, route and table stays.
 *
 * The switch is the `bfm_enabled` row in `swiftbox_settings`, set ONLY from the
 * admin (admin.swiftboxtt.com → Settings → Buy For Me service). It is ON only
 * when that row holds exactly 1; a missing row, an unreadable value or a failed
 * read is OFF — the switch FAILS CLOSED. Identical copy of the admin's
 * lib/bfm-switch-core.ts (same key, same rule).
 *
 * While OFF the app: hides every Buy For Me entry point, shows BFM_PAUSED_MESSAGE
 * on the Buy For Me pages, refuses a new request and a payment slip, and still
 * shows a customer their EXISTING requests (read-only) and lets them cancel an
 * unpaid one.
 */

export const BFM_ENABLED_KEY = "bfm_enabled" as const;

/** The stored value → on/off. Only exactly 1 is ON. */
export function bfmEnabledFromValue(raw: unknown): boolean {
  if (raw == null) return false;
  if (typeof raw !== "number" && typeof raw !== "string") return false;
  if (typeof raw === "string" && raw.trim() === "") return false;
  const n = Number(raw);
  return Number.isFinite(n) && n === 1;
}

/** Word for word on every paused Buy For Me page and every refused write. */
export const BFM_PAUSED_MESSAGE =
  "Buy For Me is paused for now. You can still shop any US store yourself and ship to your free Miami address.";

/** Where the customer's Miami address is shown. */
export const MIAMI_ADDRESS_PATH = "/dashboard/account";
