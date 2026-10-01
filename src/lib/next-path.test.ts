import { describe, expect, it } from "vitest";
import { safeNext } from "./next-path";

/* The login return path. The value comes from a URL anyone can craft, so only a
   plain path inside the logged-in app is ever followed. */

describe("safeNext — accepted", () => {
  it("returns to Buy For Me (and its pages) after logging in", () => {
    expect(safeNext("/dashboard/buy-for-me")).toBe("/dashboard/buy-for-me");
    expect(safeNext("/dashboard/buy-for-me/12")).toBe("/dashboard/buy-for-me/12");
    expect(safeNext("/dashboard/buy-for-me/new")).toBe("/dashboard/buy-for-me/new");
    expect(safeNext("%2Fdashboard%2Fbuy-for-me%2F12")).toBe("/dashboard/buy-for-me/12");
  });
  it("keeps a query string on an allowed path", () => {
    expect(safeNext("/dashboard/buy-for-me?tab=open")).toBe("/dashboard/buy-for-me?tab=open");
  });
  it("accepts the dashboard itself and the account area", () => {
    expect(safeNext("/dashboard")).toBe("/dashboard");
    expect(safeNext("/account")).toBe("/account");
  });
});

describe("safeNext — refused", () => {
  const bad: Array<string | null | undefined> = [
    null,
    undefined,
    "",
    "   ",
    "dashboard/buy-for-me",
    "//evil.example/dashboard",
    "///evil.example",
    "/\evil.example",
    "\\evil.example",
    "/dashboard\..\login",
    "https://evil.example/dashboard",
    "http://app.swiftboxtt.com/dashboard",
    "javascript:alert(1)",
    "/javascript:alert(1)",
    "%2F%2Fevil.example",
    "/%2F%2Fevil.example",
    "/dashboard/../login",
    "/dashboard/./buy-for-me",
    "/dashboard%2F..%2Flogin",
    "/login",
    "/",
    "/dashboardx",
    "/admin",
    "/dashboard\n/evil",
    "/dashboard\t/x",
    "%E0%A4%A",
    "/dashboard/" + "a".repeat(400),
  ];
  for (const b of bad) {
    it(`refuses ${JSON.stringify(b)?.slice(0, 40)}`, () => {
      expect(safeNext(b)).toBeNull();
    });
  }
});
