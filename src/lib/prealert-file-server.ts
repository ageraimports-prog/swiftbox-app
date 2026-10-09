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
import { prealertLockedSql } from "@/lib/prealert-lock-sql";
import { LOCKED_MESSAGE } from "@/lib/prealert-edit-core";
import { auditFileReplaced } from "@/lib/prealert-edit-server";

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
 *
 * LOCK: like an edit, no file is attached or replaced once the pre-alert's
 * matched package is cleared or invoiced (prealert-lock-sql.ts) — 409.
 *
 * REPLACE (`replace: true`, from the edit form): the existing row is UPDATED
 * in place — same file_id, so the admin's streaming link keeps working —
 * guarded on the old blob_url; only then is the old blob deleted. A failed row
 * write deletes the NEW blob instead. Audited as a customer edit.
 */
export async function attachPrealertFile(
  s: SessionUser,
  prealertId: number,
  file: File,
  opts: { replace?: boolean } = {}
): Promise<AttachResult> {
  if (!(await uploadsEnabled())) return { ok: false, status: 503, error: "Invoice upload isn't available yet." };
  if (!Number.isInteger(prealertId) || prealertId <= 0) return { ok: false, status: 404, error: "Not found." };
  if (file.size <= 0) return { ok: false, status: 400, error: "The file is empty." };
  if (file.size > PREALERT_FILE_MAX_BYTES) {
    return { ok: false, status: 413, error: "That file is too big — please send a photo or PDF under 4 MB." };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = detectPrealertFileType(bytes);
  if (!type) return { ok: false, status: 415, error: "Please upload a photo (JPG, PNG or WebP) or a PDF of your invoice." };

  const [own] = await query<{ prealert_id: number; has_file: number; demo: number; locked: number }>(
    `SELECT sp.prealert_id, (SELECT COUNT(*) FROM ${TABLE} f WHERE f.prealert_id = sp.prealert_id) AS has_file,
            ${prealertLockedSql("sp")} AS locked,
            (sp.user_id IN (SELECT id FROM users WHERE email = :demoEmail) OR sp.tracking_number LIKE :demoPrefix) AS demo
       FROM swiftbox_prealerts sp WHERE sp.prealert_id = :prealertId AND sp.user_id = :userId LIMIT 1`,
    { prealertId, userId: s.id, demoEmail: PLAY_DEMO_EMAIL, demoPrefix: `${PLAY_DEMO_TRACKING_PREFIX}%` }
  );
  if (!own) return { ok: false, status: 404, error: "Not found." };
  if (Number(own.demo) === 1) return { ok: true };
  if (Number(own.locked) === 1) return { ok: false, status: 409, error: LOCKED_MESSAGE };
  if (Number(own.has_file) > 0 && opts.replace) return replaceFile(s, prealertId, file, bytes, type);
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

async function replaceFile(
  s: SessionUser,
  prealertId: number,
  file: File,
  bytes: Uint8Array,
  type: { contentType: string; ext: string }
): Promise<AttachResult> {
  const [old] = await query<{ file_id: number; blob_url: string; original_name: string | null }>(
    `SELECT file_id, blob_url, original_name FROM ${TABLE} WHERE prealert_id = :prealertId AND user_id = :userId LIMIT 1`,
    { prealertId, userId: s.id }
  );
  if (!old) return { ok: false, status: 409, error: "Please try again." };
  const blob = await put(prealertFilePath(prealertId, randomFileName(), type.ext), Buffer.from(bytes), {
    access: "private",
    contentType: type.contentType,
    addRandomSuffix: true,
    token: blobToken(),
  });
  const name = cleanFileName(file.name);
  let changed = 0;
  try {
    const res = await execute(
      `UPDATE ${TABLE} SET blob_url = :url, content_type = :type, size_bytes = :size, original_name = :name
        WHERE file_id = :fileId AND prealert_id = :prealertId AND user_id = :userId AND blob_url = :oldUrl
        LIMIT 1`,
      { url: blob.url, type: type.contentType, size: bytes.length, name, fileId: old.file_id, prealertId, userId: s.id, oldUrl: old.blob_url }
    );
    changed = Number(res.affectedRows);
  } catch (e) {
    await del(blob.url, { token: blobToken() }).catch(() => {});
    throw e;
  }
  if (changed !== 1) {
    await del(blob.url, { token: blobToken() }).catch(() => {});
    return { ok: false, status: 409, error: "Your invoice changed while uploading — please try again." };
  }
  await del(old.blob_url, { token: blobToken() }).catch(() => {});
  await auditFileReplaced(s, prealertId, old.original_name, name);
  return { ok: true };
}
