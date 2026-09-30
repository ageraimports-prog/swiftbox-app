import { describe, expect, it } from "vitest";
import {
  cleanFileName,
  detectPrealertFileType,
  prealertFilePath,
  PREALERT_FILE_MAX_BYTES,
  PREALERT_FILE_PATH_RE,
  randomFileName,
} from "./prealert-file";
import { toastMessage } from "./prealert-pick";

const pad = (head: number[]) => new Uint8Array([...head, ...new Array(16).fill(0)]);

describe("pre-alert invoice files: type by first bytes, private unguessable names", () => {
  it("accepts JPEG, PNG, WebP and PDF by their bytes", () => {
    expect(detectPrealertFileType(pad([0xff, 0xd8, 0xff, 0xe0]))?.contentType).toBe("image/jpeg");
    expect(detectPrealertFileType(pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))?.contentType).toBe("image/png");
    expect(detectPrealertFileType(pad([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]))?.contentType).toBe("image/webp");
    expect(detectPrealertFileType(pad([0x25, 0x50, 0x44, 0x46, 0x2d]))?.ext).toBe("pdf");
  });
  it("refuses anything else, whatever it is called", () => {
    expect(detectPrealertFileType(pad([...Buffer.from("<html>")]))).toBeNull();
    expect(detectPrealertFileType(pad([0x4d, 0x5a]))).toBeNull();
    expect(detectPrealertFileType(new Uint8Array([0xff, 0xd8]))).toBeNull();
  });
  it("names are random and paths match the stored shape", () => {
    const a = randomFileName();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(randomFileName()).not.toBe(a);
    expect(prealertFilePath(41, a, "pdf")).toMatch(PREALERT_FILE_PATH_RE);
    expect(prealertFilePath(41, a, "pdf").startsWith("prealert-invoices/41/")).toBe(true);
  });
  it("fits under Vercel's 4.5 MB request cap", () => {
    expect(PREALERT_FILE_MAX_BYTES).toBeLessThan(4.5 * 1024 * 1024);
  });
  it("file names are safe for a 3-byte utf8 column", () => {
    expect(cleanFileName("receipt 📄.pdf")).toBe("receipt .pdf");
    expect(cleanFileName("a\u0000b.jpg")).toBe("ab.jpg");
    expect(cleanFileName("   ")).toBeNull();
    expect(cleanFileName("x".repeat(300))?.length).toBe(255);
  });
  it("a failed upload is reported, never silent", () => {
    expect(toastMessage("filefail", null)).toMatch(/saved, but the invoice didn't upload/);
  });
});
