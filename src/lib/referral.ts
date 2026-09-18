import "server-only";
import { randomInt } from "node:crypto";
import { query, execute } from "@/lib/db";

/* ───────────────────────── Sub-piece D: earnings stats ───────────────────────── */

/**
 * Read-only referral earnings for the dashboard panel. All figures are scoped to
 * one referrer (= the logged-in customer's users.id).
 *
 *  - totalEarned    SUM(amount) of credits they EARNED by referring (kind='referrer'),
 *                   all-time. This is the headline number, so it must never include
 *                   the customer's own welcome credit — being referred is not earning.
 *  - welcomeCredit  the one kind='welcome' credit they were given for signing up with
 *                   someone's code, if any. Shown separately, never folded into the
 *                   headline.
 *  - available      credits not yet applied to an invoice (applied = 0), BOTH kinds —
 *                   this is spendable money, and the welcome credit spends the same.
 *  - redeemed       credits already applied to an invoice (applied = 1), both kinds.
 *  - qualifiedCount referrals that reached a first delivery (status = 'qualified').
 *  - pendingCount   referrals signed up but not yet delivered (status = 'pending').
 *
 * Money is summed from the stored `amount` column (historical rows carry their
 * own value) — never recomputed from REFERRAL_CREDIT_TTD.
 */
export type ReferralStats = {
  totalEarned: number;
  welcomeCredit: number;
  available: number;
  redeemed: number;
  qualifiedCount: number;
  pendingCount: number;
};

/** Safe all-zero stats — the fallback when a bridge read fails. */
export const ZERO_REFERRAL_STATS: ReferralStats = {
  totalEarned: 0,
  welcomeCredit: 0,
  available: 0,
  redeemed: 0,
  qualifiedCount: 0,
  pendingCount: 0,
};

type CreditAggRow = {
  total_earned: string;
  welcome_credit: string;
  available: string;
  redeemed: string;
};
type ReferralCountRow = { qualified_count: string; pending_count: string };

export async function getReferralStats(referrerId: number): Promise<ReferralStats> {
  // Two aggregates, both keyed on referrer_id. CASE-sum splits (no window
  // functions — MySQL 5.6). COALESCE(...,0) so a referrer with no rows reads 0,
  // never NULL. DECIMAL sums come back as strings through the bridge → Number().
  const [credits, counts] = await Promise.all([
    query<CreditAggRow>(
      `SELECT COALESCE(SUM(CASE WHEN kind = 'referrer' THEN amount ELSE 0 END), 0) AS total_earned,
              COALESCE(SUM(CASE WHEN kind = 'welcome'  THEN amount ELSE 0 END), 0) AS welcome_credit,
              COALESCE(SUM(CASE WHEN applied = 0 THEN amount ELSE 0 END), 0)       AS available,
              COALESCE(SUM(CASE WHEN applied = 1 THEN amount ELSE 0 END), 0)       AS redeemed
         FROM referral_credits
        WHERE referrer_id = :referrerId`,
      { referrerId }
    ),
    query<ReferralCountRow>(
      `SELECT COALESCE(SUM(CASE WHEN status = 'qualified' THEN 1 ELSE 0 END), 0) AS qualified_count,
              COALESCE(SUM(CASE WHEN status = 'pending'   THEN 1 ELSE 0 END), 0) AS pending_count
         FROM referrals
        WHERE referrer_id = :referrerId`,
      { referrerId }
    ),
  ]);

  const c = credits[0];
  const n = counts[0];
  return {
    totalEarned: Number(c?.total_earned ?? 0),
    welcomeCredit: Number(c?.welcome_credit ?? 0),
    available: Number(c?.available ?? 0),
    redeemed: Number(c?.redeemed ?? 0),
    qualifiedCount: Number(n?.qualified_count ?? 0),
    pendingCount: Number(n?.pending_count ?? 0),
  };
}

/**
 * Referral system — shared server-side logic.
 *
 * Backed by three tables (created manually in phpMyAdmin; DDL is frozen):
 *   referral_codes   (customer_id PK, code, created_at)
 *   referrals        (id, referrer_id, referred_id UNIQUE, status, ...)
 *   referral_credits (id, referrer_id, referred_id, amount, applied, ...)
 *
 * Sub-piece A only touches referral_codes (lazy generate + read of own code).
 *
 * `customer_id` maps to users.id — the same identifier every other Swiftbox
 * table keys on (session.id). See the invoices / prealerts routes.
 */

/**
 * The referral program is DOUBLE-SIDED. Two amounts, two different triggers:
 *
 *   REFERRAL_CREDIT_TTD  (100) → the REFERRER, when the referred customer's
 *                                first package is DELIVERED.
 *   REFERRAL_WELCOME_TTD  (50) → the REFERRED customer, credited at SIGNUP and
 *                                applied to their FIRST invoice.
 *
 * Keep both in step with SwiftboxAdmin lib/referrals.ts (which issues the rows)
 * and with the public copy on swiftboxtt.com/referral and /terms.
 */

/**
 * Credit awarded to the referrer once a referred customer qualifies.
 * Override per-environment with REFERRAL_CREDIT_TTD.
 *
 * Business-confirmed at 100 TTD (matches SwiftboxAdmin lib/referrals.ts). The 100
 * default is the safety net if the env var is unset in a deployment.
 */
export const REFERRAL_CREDIT_TTD: number = Number(
  process.env.REFERRAL_CREDIT_TTD ?? "100"
);

/**
 * Welcome credit awarded to the REFERRED customer for signing up with a valid
 * code. Unlike the referrer credit this does not wait for a delivery — it is
 * issued at signup and applied to their first invoice, with no minimum spend.
 * Override per-environment with REFERRAL_WELCOME_CREDIT_TTD.
 *
 * Business-confirmed at 50 TTD. Displayed on the dashboard share card and in
 * the prefilled WhatsApp message below.
 */
export const REFERRAL_WELCOME_CREDIT_TTD: number = Number(
  process.env.REFERRAL_WELCOME_CREDIT_TTD ?? "50"
);

/**
 * Unambiguous code alphabet: uppercase A–Z and digits, minus the look-alikes
 * 0 O 1 I L. 31 symbols → 31^6 ≈ 887M combinations, plenty for collision-retry.
 */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;
const MAX_INSERT_ATTEMPTS = 8;

/** Cryptographically-unbiased 6-char code from the unambiguous alphabet. */
function generateCode(): string {
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return out;
}

/** MySQL 1062 surfaces through the bridge as a "Duplicate entry ..." message. */
function isDuplicateKeyError(err: unknown): boolean {
  return err instanceof Error && /duplicate entry/i.test(err.message);
}

type CodeRow = { code: string };

async function readCode(customerId: number): Promise<string | null> {
  const rows = await query<CodeRow>(
    "SELECT code FROM referral_codes WHERE customer_id = :customerId LIMIT 1",
    { customerId }
  );
  return rows[0]?.code ?? null;
}

/**
 * Return the customer's referral code, generating + inserting one on first
 * access. Idempotent and race-safe:
 *
 *  - existing row  → returned as-is.
 *  - code clash    → the unique index on `code` rejects the INSERT; we retry
 *                    with a fresh code.
 *  - concurrent insert for the same customer → the PK rejects our INSERT; we
 *                    re-read and return whichever code won the race.
 */
export async function ensureReferralCode(customerId: number): Promise<string> {
  const existing = await readCode(customerId);
  if (existing) return existing;

  for (let attempt = 0; attempt < MAX_INSERT_ATTEMPTS; attempt++) {
    const code = generateCode();
    try {
      await execute(
        `INSERT INTO referral_codes (customer_id, code, created_at)
         VALUES (:customerId, :code, NOW())`,
        { customerId, code }
      );
      return code;
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err;

      // Either the PK (this customer already got a code via a concurrent
      // request) or the code's unique index collided. Re-read: a row now means
      // the PK won the race — return it. No row means a code clash — retry.
      const raced = await readCode(customerId);
      if (raced) return raced;
    }
  }

  throw new Error(
    `Could not allocate a unique referral code for customer ${customerId} after ${MAX_INSERT_ATTEMPTS} attempts`
  );
}

/**
 * Registration lives on the marketing WEBSITE (swiftboxtt.com/signup), NOT the
 * app — app.swiftboxtt.com has no signup page. This base is hardcoded and is
 * AUTHORITATIVE: it is what the share link uses unless an override passes the
 * same-site check in `resolveSignupBase` below. A wrong or stale SIGNUP_URL in
 * a deployment used to silently win and hand the friend a 404; it no longer
 * can.
 */
export const SIGNUP_BASE_URL = "https://swiftboxtt.com";

/**
 * The only hosts a signup-base override may point at. Registration exists on
 * the marketing site and nowhere else, so an override is a way to swap between
 * the apex and www — not a way to point the link at another origin. Note that
 * `app.swiftboxtt.com` is deliberately absent: the app has no /signup page.
 */
const ALLOWED_SIGNUP_HOSTS = new Set(["swiftboxtt.com", "www.swiftboxtt.com"]);

/**
 * Resolve the base URL the share link is built on.
 *
 * Unset/blank override → SIGNUP_BASE_URL, silently: that is the normal, correct
 * configuration, not a misconfiguration, and this runs on every dashboard
 * render. A non-blank override that fails the check is a real deployment bug,
 * so it gets a one-line console.warn naming the offending value — that surfaces
 * in the Vercel runtime logs instead of failing silently for the friend.
 *
 * The check is deliberately strict: parses as a URL, https, and a hostname in
 * ALLOWED_SIGNUP_HOSTS. Everything else (http, app.swiftboxtt.com, localhost,
 * a tunnel domain, garbage) falls back.
 */
function resolveSignupBase(signupBaseUrl?: string): string {
  const candidate = signupBaseUrl?.trim();
  if (!candidate) return SIGNUP_BASE_URL;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    console.warn(
      `[referral] Ignoring signup base override ${JSON.stringify(candidate)} — not a valid URL. Falling back to ${SIGNUP_BASE_URL}.`
    );
    return SIGNUP_BASE_URL;
  }

  if (parsed.protocol !== "https:" || !ALLOWED_SIGNUP_HOSTS.has(parsed.hostname)) {
    console.warn(
      `[referral] Ignoring signup base override ${JSON.stringify(candidate)} — only https://swiftboxtt.com and https://www.swiftboxtt.com are accepted. Falling back to ${SIGNUP_BASE_URL}.`
    );
    return SIGNUP_BASE_URL;
  }

  return candidate;
}

/**
 * WhatsApp share deep link with a prefilled, natural recommendation message.
 * The program is double-sided, so the message leads with what the FRIEND gets
 * (REFERRAL_WELCOME_CREDIT_TTD off their first shipment) — that is the reason
 * they'd bother entering a code. The link always deep-links to the website
 * signup page with the referrer's code prefilled — `/signup?ref=CODE` — which
 * the signup page reads from the query string and uppercases into the referral
 * field (Sub-piece B).
 *
 * PRECEDENCE: SIGNUP_BASE_URL wins by default. `signupBaseUrl` (in practice
 * process.env.SIGNUP_URL) is a SAME-SITE override, not an escape hatch — it is
 * honoured only when it is a valid https URL on swiftboxtt.com or
 * www.swiftboxtt.com. Anything else is ignored, warned about, and replaced with
 * SIGNUP_BASE_URL. The friend therefore cannot be sent to a 404 by a bad env
 * var; the worst a misconfigured deployment can do is log a warning.
 */
export function whatsappShareUrl(code: string, signupBaseUrl?: string): string {
  const base = resolveSignupBase(signupBaseUrl).replace(/\/+$/, "");
  const link = `${base}/signup?ref=${encodeURIComponent(code)}`;
  const text = encodeURIComponent(
    [
      `Hey! I've been using Swift Box to ship my online orders down to Trinidad and the service and rates are unmatchable 📦 Use my referral code *${code}* when you sign up and you'll get TT$${REFERRAL_WELCOME_CREDIT_TTD} off your first shipment.`,
      ``,
      link,
    ].join("\n")
  );
  return `https://wa.me/?text=${text}`;
}
