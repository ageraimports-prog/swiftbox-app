import { beforeEach, describe, expect, it, vi } from "vitest";

/** attachPrealertFile with a fake bridge and a fake blob store — nothing leaves the machine. */

const db = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn() }));
const blob = vi.hoisted(() => ({ put: vi.fn(), del: vi.fn() }));
vi.mock("@/lib/db", () => db);
vi.mock("@vercel/blob", () => blob);

import { attachPrealertFile, uploadsEnabled } from "./prealert-file-server";

const session = { id: 77, ac: "0077", name: "Test", email: "t@swiftbox-harness.test" };
const pdf = (size = 32) => new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, ...new Array(size - 5).fill(0)])], "inv.pdf", { type: "application/pdf" });

function tableThere(own: { prealert_id: number; has_file: number; demo?: number } | null) {
  db.query.mockImplementation(async (sql: string) => {
    if (sql.includes("LIMIT 0")) return [];
    if (sql.includes("FROM swiftbox_prealerts sp")) return own ? [{ demo: 0, ...own }] : [];
    throw new Error("unexpected " + sql);
  });
}

beforeEach(() => {
  vi.resetModules();
  db.query.mockReset();
  db.execute.mockReset();
  blob.put.mockReset();
  blob.del.mockReset();
  process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test";
  blob.put.mockResolvedValue({ url: "https://store.private.blob/prealert-invoices/5/x.pdf" });
  blob.del.mockResolvedValue(undefined);
});

describe("uploadsEnabled", () => {
  it("is off without a token", async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    const m = await import("./prealert-file-server");
    expect(await m.uploadsEnabled()).toBe(false);
  });
  it("is off while the table is missing (migration 041 not applied)", async () => {
    db.query.mockRejectedValue(new Error("Table 'x.swiftbox_prealert_files' doesn't exist"));
    const m = await import("./prealert-file-server");
    expect(await m.uploadsEnabled()).toBe(false);
  });
});

describe("attachPrealertFile", () => {
  it("stores the file privately and records it for the customer's OWN pre-alert", async () => {
    tableThere({ prealert_id: 5, has_file: 0 });
    db.execute.mockResolvedValue({ affectedRows: 1, insertId: 9 });
    const m = await import("./prealert-file-server");
    expect(await m.attachPrealertFile(session, 5, pdf())).toEqual({ ok: true });
    expect(blob.put).toHaveBeenCalledOnce();
    const [path, , opts] = blob.put.mock.calls[0];
    expect(path).toMatch(/^prealert-invoices\/5\/[0-9a-f]{32}\.pdf$/);
    expect(opts).toMatchObject({ access: "private", contentType: "application/pdf", addRandomSuffix: true });
    const [sql, params] = db.execute.mock.calls[0];
    expect(sql).toContain("INSERT INTO swiftbox_prealert_files");
    expect(params).toMatchObject({ prealertId: 5, userId: 77, type: "application/pdf", name: "inv.pdf" });
    // Ownership is in the query itself.
    expect(db.query.mock.calls.find((c) => String(c[0]).includes("sp.user_id = :userId"))?.[1]).toMatchObject({ prealertId: 5, userId: 77 });
  });
  it("another customer's (or a missing) pre-alert answers 404 and stores nothing", async () => {
    tableThere(null);
    const m = await import("./prealert-file-server");
    expect(await m.attachPrealertFile(session, 5, pdf())).toMatchObject({ ok: false, status: 404 });
    expect(blob.put).not.toHaveBeenCalled();
  });
  it("the Play demo account is answered ok and nothing is stored", async () => {
    tableThere({ prealert_id: 5, has_file: 0, demo: 1 });
    const m = await import("./prealert-file-server");
    expect(await m.attachPrealertFile(session, 5, pdf())).toEqual({ ok: true });
    expect(blob.put).not.toHaveBeenCalled();
    expect(db.execute).not.toHaveBeenCalled();
  });
  it("refuses a second file", async () => {
    tableThere({ prealert_id: 5, has_file: 1 });
    const m = await import("./prealert-file-server");
    expect(await m.attachPrealertFile(session, 5, pdf())).toMatchObject({ ok: false, status: 409 });
    expect(blob.put).not.toHaveBeenCalled();
  });
  it("checks the real type from the bytes and the size before anything else", async () => {
    tableThere({ prealert_id: 5, has_file: 0 });
    const m = await import("./prealert-file-server");
    const html = new File([new TextEncoder().encode("<html><body>hi</body></html>")], "inv.pdf", { type: "application/pdf" });
    expect(await m.attachPrealertFile(session, 5, html)).toMatchObject({ ok: false, status: 415 });
    const big = new File([new Uint8Array(4 * 1024 * 1024 + 1)], "big.pdf", { type: "application/pdf" });
    expect(await m.attachPrealertFile(session, 5, big)).toMatchObject({ ok: false, status: 413 });
    expect(blob.put).not.toHaveBeenCalled();
  });
  it("a double tap that loses the UNIQUE race deletes its stored file again", async () => {
    tableThere({ prealert_id: 5, has_file: 0 });
    db.execute.mockRejectedValue(new Error("Duplicate entry '5' for key 'uq_prealert_files_prealert'"));
    const m = await import("./prealert-file-server");
    expect(await m.attachPrealertFile(session, 5, pdf())).toMatchObject({ ok: false, status: 409 });
    expect(blob.del).toHaveBeenCalledWith("https://store.private.blob/prealert-invoices/5/x.pdf", expect.anything());
  });
  it("any other write failure also deletes the file, then reports", async () => {
    tableThere({ prealert_id: 5, has_file: 0 });
    db.execute.mockRejectedValue(new Error("Bridge HTTP 500"));
    const m = await import("./prealert-file-server");
    await expect(m.attachPrealertFile(session, 5, pdf())).rejects.toThrow("Bridge HTTP 500");
    expect(blob.del).toHaveBeenCalledOnce();
  });
});

// keep the static imports referenced so the module graph is the one under test
void attachPrealertFile;
void uploadsEnabled;
