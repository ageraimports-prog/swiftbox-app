/**
 * Pre-alert invoice/receipt files — pure checks, unit-tested in
 * prealert-file.test.ts. Same rules as the Buy For Me payment slips (the other
 * customer upload into the PRIVATE blob store):
 *
 * - The TYPE is decided by the file's first bytes, never by its name or by what
 *   the browser claims: only JPEG, PNG, WebP and PDF.
 * - 4 MB max, under Vercel's 4.5 MB request limit (phone photos are shrunk in
 *   the browser first).
 * - The storage path is random and unguessable, never the customer's file name.
 */

export const PREALERT_FILE_MAX_BYTES = 4 * 1024 * 1024;

export const PREALERT_FILE_ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";

export type PrealertFileType = {
  contentType: "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
  ext: "jpg" | "png" | "webp" | "pdf";
};

export function detectPrealertFileType(b: Uint8Array): PrealertFileType | null {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { contentType: "image/jpeg", ext: "jpg" };
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) {
    return { contentType: "image/png", ext: "png" };
  }
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
    return { contentType: "image/webp", ext: "webp" };
  }
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d) return { contentType: "application/pdf", ext: "pdf" };
  return null;
}

/** 32 random hex characters. */
export function randomFileName(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (x) => x.toString(16).padStart(2, "0")).join("");
}

/** prealert-invoices/<prealert id>/<32 hex>.<ext> */
export function prealertFilePath(prealertId: number, name: string, ext: string): string {
  return `prealert-invoices/${Math.trunc(prealertId)}/${name}.${ext}`;
}

export const PREALERT_FILE_PATH_RE = /^prealert-invoices\/\d+\/[0-9a-f]{32}(-[A-Za-z0-9]+)?\.(jpg|png|webp|pdf)$/;

/** The customer's file name, safe for a 3-byte utf8 VARCHAR(255): no emoji, no control chars. */
export function cleanFileName(raw: unknown): string | null {
  const s = String(raw ?? "")
    .replace(/[\u{10000}-\u{10FFFF}]/gu, "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 255);
  return s || null;
}
