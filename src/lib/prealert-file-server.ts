import "server-only";
import { del, put } from "@vercel/blob";
import { execute, query } from "@/lib/db";
import type { SessionUser } from "@/lib/session";
import {
  cleanFileName,
  detectPrealertFileType,
  prealertFilePath,
  PREALERT_FILE_MAX_BYTES,
  randomFileName,
} from "@/lib/prealert-file";
import { PLAY_DEMO_EMAIL, PLAY_DEMO_TRACKING_PREFIX } from "@/lib/prealert-pick";

/**
 * The optional invoice/receipt on a pre-alert (SwiftboxAdmin migration 041,
 * table swiftbox_prealert_files, one file per pre-alert). Stored like the Buy
 * For Me payment slips: through THIS server into the PRIVATE blob store, so the
 * blob URL never reaches a browser. The admin streams it to authorised staff;
 * nothing here ever returns where it is stored.
 *
 * Optional and never blocking: the pre-alert is saved first, the file is
 * attached afterwards by its own request. Until migration 041 is applied (or
 * without a blob token) `uploadsEnabled()` is false and the form hides the field.
 */

const TABLE = "swiftbox_prealert_files";
const blobToken = () => process.env.BLOB_READ_WRITE_TOKEN?.trim() || undefined;

let cachedEnabled: { at: number; value: boolean } | null = null;

/** Is the upload switched on? Table present AND a blob token. Re-checked every 60 s. */
export async function uploadsEnabled(): Promise<boolean> {
  if (!blobToken()) return false;
  if (cachedEnabled && Date.now() - cachedEnabled.at < 60_000) return cachedEnabled.value;
  let value = false;
  try {
    await query(`SELECT file_id FROM ${TABLE} LIMIT 0`);
    value = true;
  } catch {
    value = false;
  }
  cachedEnabled = { at: Date.now(), value };
  return value;
}

export type AttachResult = { ok: true } | { ok: false; status: number; error: string };

/**
 * Attach a file to one of the customer's OWN pre-alerts. Checks size, then the
 * real type from the bytes, then ownership, then that no file is attached yet;
 * only then stores it. A failed row write deletes the stored file again, and
 * the UNIQUE key on prealert_id stops a second file from a double tap.
 *
 * The Play demo account (#0364) is answered "ok" and NOTHING is stored, so a
 * reviewer's upload never leaves a file or a row behind.
 */
export async function attachPrealertFile(s: SessionUser, prealertId: number, file: File): Promise<AttachResult> {
  if (!(await uploadsEnabled())) return { ok: false, status: 503, error: "Invoice upload isn't available yet." };
  if (!Number.isInteger(prealertId) || prealertId <= 0) return { ok: false, status: 404, error: "Not found." };
  if (file.size <= 0) return { ok: false, status: 400, error: "The file is empty." };
  if (file.size > PREALERT_FILE_MAX_BYTES) {
    return { ok: false, status: 413, error: "That file is too big — please send a photo or PDF under 4 MB." };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = detectPrealertFileType(bytes);
  if (!type) return { ok: false, status: 415, error: "Please upload a photo (JPG, PNG or WebP) or a PDF of your invoice." };

  const [own] = await query<{ prealert_id: number; has_file: number; demo: number }>(
    `SELECT sp.prealert_id, (SELECT COUNT(*) FROM ${TABLE} f WHERE f.prealert_id = sp.prealert_id) AS has_file,
            (sp.user_id IN (SELECT id FROM users WHERE email = :demoEmail) OR sp.tracking_number LIKE :demoPrefix) AS demo
       FROM swiftbox_prealerts sp WHERE sp.prealert_id = :prealertId AND sp.user_id = :userId LIMIT 1`,
    { prealertId, userId: s.id, demoEmail: PLAY_DEMO_EMAIL, demoPrefix: `${PLAY_DEMO_TRACKING_PREFIX}%` }
  );
  if (!own) return { ok: false, status: 404, error: "Not found." };
  if (Number(own.demo) === 1) return { ok: true };
  if (Number(own.has_file) > 0) return { ok: false, status: 409, error: "An invoice is already attached to this pre-alert." };

  const blob = await put(prealertFilePath(prealertId, randomFileName(), type.ext), Buffer.from(bytes), {
    access: "private",
    contentType: type.contentType,
    addRandomSuffix: true,
    token: blobToken(),
  });
  try {
    await execute(
      `INSERT INTO ${TABLE} (prealert_id, user_id, blob_url, content_type, size_bytes, original_name)
       VALUES (:prealertId, :userId, :url, :type, :size, :name)`,
      { prealertId, userId: s.id, url: blob.url, type: type.contentType, size: bytes.length, name: cleanFileName(file.name) }
    );
  } catch (e) {
    await del(blob.url, { token: blobToken() }).catch(() => {});
    if (e instanceof Error && /Duplicate entry/i.test(e.message)) {
      return { ok: false, status: 409, error: "An invoice is already attached to this pre-alert." };
    }
    throw e;
  }
  return { ok: true };
}
