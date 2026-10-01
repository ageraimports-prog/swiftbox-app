/**
 * Where to go after logging in. A WhatsApp link to /dashboard/buy-for-me must
 * land there after the login, not on the dashboard — but the `next` value comes
 * from a URL anyone can craft, so only a plain path inside the app is accepted
 * (never another site: no scheme, no "//host", no backslash tricks). Edge-safe,
 * pure; tested in next-path.test.ts.
 */
const ALLOWED = ["/dashboard", "/account"];

export function safeNext(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s: string;
  try {
    s = decodeURIComponent(String(raw)).trim();
  } catch {
    return null;
  }
  if (s.length === 0 || s.length > 300) return null;
  if (!s.startsWith("/") || s.startsWith("//") || s.includes("\\") || /[\u0000-\u001f]/.test(s)) return null;
  if (/^\/[^/]*:/.test(s)) return null;
  const path = s.split(/[?#]/)[0];
  // No dot segments: "/dashboard/../login" must not climb out of the allowed area.
  if (path.split("/").some((seg) => seg === ".." || seg === ".")) return null;
  if (!ALLOWED.some((p) => path === p || path.startsWith(`${p}/`))) return null;
  return s;
}
