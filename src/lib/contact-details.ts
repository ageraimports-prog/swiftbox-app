import "server-only";
import { execute, query } from "@/lib/db";
import { contactWrite, detailsFromRow, type ContactDetails, type StoredContact } from "@/lib/contact-details-core";

/**
 * Read / save the signed-in customer's delivery details (Account page).
 * Rules: src/lib/contact-details-core.ts. Writes ONLY users.phone, alt_phones,
 * address, city, zone (blanked when the address changes) and — once admin
 * migration 062 has run — alt_address, alt_city, alt_zone, address_label,
 * alt_address_label. Always WHERE id = the session's user id.
 */

const COLS_062 = ["alt_address", "alt_city", "alt_zone", "address_label", "alt_address_label"];

/** Migration 062 present? One information_schema read; fails closed. */
async function altAddressReady(): Promise<boolean> {
  try {
    const [r] = await query<{ n: number }>(
      `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
          AND COLUMN_NAME IN (${COLS_062.map((c) => `'${c}'`).join(",")})`
    );
    return Number(r?.n) === COLS_062.length;
  } catch {
    return false;
  }
}

async function readStored(userId: number, ready: boolean): Promise<StoredContact | null> {
  const rows = await query<StoredContact>(
    `SELECT phone, alt_phones, address, city${ready ? ", alt_address, alt_city, address_label, alt_address_label" : ""}
       FROM users WHERE id = :id AND type = 'member' LIMIT 1`,
    { id: userId }
  );
  return rows[0] ?? null;
}

export async function getContactDetails(userId: number): Promise<ContactDetails | null> {
  const ready = await altAddressReady();
  const row = await readStored(userId, ready);
  return row ? detailsFromRow(row, ready) : null;
}

export async function saveContactDetails(
  userId: number,
  input: Record<string, unknown>
): Promise<{ ok: true; details: ContactDetails } | { ok: false; error: string }> {
  const ready = await altAddressReady();
  const stored = await readStored(userId, ready);
  if (!stored) return { ok: false, error: "We couldn't find your account." };
  const w = contactWrite(input, stored, ready);
  if (!w.ok) return w;
  const cols = Object.keys(w.set);
  if (cols.length > 0) {
    await execute(
      `UPDATE users SET ${cols.map((c) => `${c} = :${c}`).join(", ")} WHERE id = :id AND type = 'member'`,
      { ...w.set, id: userId }
    );
  }
  const after = await readStored(userId, ready);
  return { ok: true, details: detailsFromRow(after ?? stored, ready) };
}
