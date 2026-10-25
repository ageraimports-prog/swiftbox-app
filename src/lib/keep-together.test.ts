import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

vi.mock("@/lib/db", () => ({ query: vi.fn(), execute: vi.fn() }));

/** "Keep waiting" → admin customer-keep (Brent, 2026-10-25). Never throws, never blocks. */
describe("recordKeepTogether", () => {
  const env = { ...process.env };
  beforeEach(() => { process.env.CONSOLIDATION_HOOK_KEY = "k".repeat(32); process.env.ADMIN_URL = "https://admin.example/"; });
  afterEach(() => { process.env = { ...env }; vi.unstubAllGlobals(); });

  it("posts the user and group to the admin with the consolidation key", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const { recordKeepTogether } = await import("@/lib/consolidated-billing");
    expect(await recordKeepTogether(1921, 38)).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://admin.example/api/consolidated-billing/customer-keep");
    expect(init.headers["x-consolidation-key"]).toBe("k".repeat(32));
    expect(JSON.parse(init.body)).toEqual({ userId: 1921, groupId: 38 });
  });

  it("swallows every failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("fetch failed")));
    const { recordKeepTogether } = await import("@/lib/consolidated-billing");
    await expect(recordKeepTogether(1921, 38)).resolves.toBe(false);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    await expect(recordKeepTogether(1921, 38)).resolves.toBe(false);
  });

  it("does nothing without a key or with bad ids", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { recordKeepTogether } = await import("@/lib/consolidated-billing");
    delete process.env.CONSOLIDATION_HOOK_KEY;
    expect(await recordKeepTogether(1921, 38)).toBe(false);
    process.env.CONSOLIDATION_HOOK_KEY = "k".repeat(32);
    expect(await recordKeepTogether(1921, 0)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("the Keep waiting button calls the route and ignores failures", () => {
    const src = readFileSync(path.join(__dirname, "..", "components", "SendMyPackagesNow.tsx"), "utf8");
    expect(src).toMatch(/fetch\("\/api\/consolidated-billing\/keep-together"[\s\S]*?\.catch\(\(\) => \{\}\)/);
  });
});
