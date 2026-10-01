/**
 * Payment-slip file checks — pure, so they are unit-tested (slip-file.test.ts).
 *
 * The TYPE is decided by the file's first bytes, never by its name or by what
 * the browser claims: a renamed .exe or .html must not be stored as a "slip"
 * and later served inline. Only JPEG, PNG, WebP and PDF are accepted.
 */

export const SLIP_MAX_BYTES = 4 * 1024 * 1024; // under Vercel's 4.5 MB request limit

export type SlipType = { contentType: "image/jpeg" | "image/png" | "image/webp" | "application/pdf"; ext: "jpg" | "png" | "webp" | "pdf" };

export function detectSlipType(b: Uint8Array): SlipType | null {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { contentType: "image/jpeg", ext: "jpg" };
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) {
    return { contentType: "image/png", ext: "png" };
  }
  if (
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && // RIFF
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 // WEBP
  ) {
    return { contentType: "image/webp", ext: "webp" };
  }
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d) return { contentType: "application/pdf", ext: "pdf" }; // %PDF-
  return null;
}

/** 32 random hex characters for the storage path — never guessable, never the customer's file name. */
export function randomSlipName(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (x) => x.toString(16).padStart(2, "0")).join("");
}

/** The storage path: bfm-slips/<request id>/<32 hex>.<ext>. */
export function slipPath(requestId: number, name: string, ext: string): string {
  return `bfm-slips/${requestId}/${name}.${ext}`;
}

export const SLIP_PATH_RE = /^bfm-slips\/\d+\/[0-9a-f]{32}(-[A-Za-z0-9]+)?\.(jpg|png|webp|pdf)$/;
