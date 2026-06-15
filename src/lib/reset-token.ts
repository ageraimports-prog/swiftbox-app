import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { query, execute } from "@/lib/db";

/**
 * Password-reset tokens, DB-backed and single-use.
 *
 * A random raw token is emailed in the reset link; only its SHA-256 is stored
 * (token_hash), so a leak of the `password_resets` table never exposes a usable
 * link. Single use is enforced by `used_at`, expiry by `expires_at` (~60 min).
 * Both are checked atomically when the token is claimed.
 */

const TOKEN_BYTES = 32; // 64 hex chars
const TTL_MINUTES = 60;

function sha256Hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/**
 * Creates a single-use reset-token row for a user and returns the RAW token
 * (the value that goes in the emailed link — never stored).
 */
export async function createResetToken(userId: number): Promise<string> {
  const raw = randomBytes(TOKEN_BYTES).toString("hex");
  const tokenHash = sha256Hex(raw);
  await execute(
    `INSERT INTO password_resets (user_id, token_hash, expires_at, created_at)
     VALUES (:userId, :tokenHash, DATE_ADD(NOW(), INTERVAL ${TTL_MINUTES} MINUTE), NOW())`,
    { userId, tokenHash }
  );
  return raw;
}

/**
 * Atomically claims a valid token: marks it used and returns its user_id.
 * Returns null if the token is unknown, already used, or expired. The
 * conditional UPDATE is the single-use gate — a concurrent second claim of the
 * same token sees affectedRows = 0 and is rejected.
 */
export async function claimResetToken(rawToken: string): Promise<number | null> {
  if (!rawToken) return null;
  const tokenHash = sha256Hex(rawToken);

  const claim = await execute(
    `UPDATE password_resets SET used_at = NOW()
      WHERE token_hash = :tokenHash AND used_at IS NULL AND expires_at > NOW()`,
    { tokenHash }
  );
  if (claim.affectedRows !== 1) return null;

  const rows = await query<{ userId: number }>(
    `SELECT user_id AS userId FROM password_resets
      WHERE token_hash = :tokenHash LIMIT 1`,
    { tokenHash }
  );
  return rows[0]?.userId ?? null;
}
