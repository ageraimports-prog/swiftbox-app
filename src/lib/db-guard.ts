/**
 * LOCAL = DEV DATABASE ONLY (Brent, 2026-10-13).
 *
 * Every byte of SQL this repo sends goes to a PHP bridge (lib/db.ts for the app,
 * scripts/bridge.ts for scripts). Production is `swiftbox_new_live_track` behind
 * https://livetracker.swiftboxtt.com/api-bridge/bridge.php. A local run — `next
 * dev`, a tsx script, a test — must reach the DEVELOPMENT database
 * (`swiftbox_dev`, behind /api-bridge-dev/bridge.php) and nothing else: on
 * 2026-10-12 a local dev server signed in with a test cookie wrote to live.
 *
 * TWO checks, both fail closed:
 *  1. The bridge URL (before any request): outside the production runtime it
 *     must be the dev bridge (a path segment `api-bridge-dev`), a loopback host,
 *     or an RFC 2606 `.invalid` host (the fake bridges the tests stub `fetch`
 *     with). Anything else — the production path, an alias, a typo — is refused.
 *  2. The database itself (first request of the process, lib/db.ts and
 *     scripts/bridge.ts): `SELECT DATABASE()` must not be a production name and
 *     must contain "dev" or "test".
 *
 * PRODUCTION RUNTIME = NODE_ENV "production" AND running on Vercel (VERCEL=1).
 * Requiring both means a local `next build`/`next start` or a script started
 * with NODE_ENV=production is still a local run. There is NO override: a
 * production write is done through the deployed admin, after Brent approves it
 * in chat, never from a developer machine (and no local file holds production
 * credentials any more).
 *
 * Pure (no imports) so next.config, the db module and the scripts share it.
 *
 * CODE-IDENTICAL IN THREE REPOS: SwiftboxAdmin lib/db-guard.ts, SwiftboxApp
 * src/lib/db-guard.ts and the website's src/lib/db-guard.ts. Change all three.
 */

export const PRODUCTION_DATABASES: readonly string[] = ["swiftbox_new_live_track", "swiftbox-live-track"];
export const PRODUCTION_BRIDGE_HOST = "livetracker.swiftboxtt.com";
export const DEV_BRIDGE_SEGMENT = "api-bridge-dev";

export function isProductionRuntime(env: Record<string, string | undefined> = process.env): boolean {
  return env.NODE_ENV === "production" && env.VERCEL === "1";
}

const HOW_TO_FIX =
  "Local runs must use the DEVELOPMENT database (swiftbox_dev): set BRIDGE_URL to " +
  `https://${PRODUCTION_BRIDGE_HOST}/${DEV_BRIDGE_SEGMENT}/bridge.php and the DEV key / secret ` +
  "in .env.local (CLAUDE.md, \"Local = dev database only\"). A change to PRODUCTION data needs Brent's explicit approval in chat " +
  "and is made through the deployed admin, never from a local machine.";

/** Why this bridge URL may not be used here, or null when it may. */
export function bridgeUrlProblem(url: string | undefined, env: Record<string, string | undefined> = process.env): string | null {
  if (isProductionRuntime(env)) return null;
  if (!url) return `BRIDGE_URL is not set. ${HOW_TO_FIX}`;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return `BRIDGE_URL is not a valid URL. ${HOW_TO_FIX}`;
  }
  const host = u.hostname.toLowerCase();
  if (host.endsWith(".invalid") || host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]") return null;
  if (u.pathname.split("/").includes(DEV_BRIDGE_SEGMENT)) return null;
  return (
    `Refusing to run: this is a local run (NODE_ENV=${env.NODE_ENV ?? "unset"}, not on Vercel) but BRIDGE_URL points at ` +
    `${host}${u.pathname}, which is not the development bridge — it may be PRODUCTION. ${HOW_TO_FIX}`
  );
}

/** Why this database may not be used here, or null when it may. */
export function databaseProblem(name: string | null | undefined, env: Record<string, string | undefined> = process.env): string | null {
  if (isProductionRuntime(env)) return null;
  const n = String(name ?? "").trim();
  if (PRODUCTION_DATABASES.includes(n)) {
    return `Refusing to run: this local run is connected to the PRODUCTION database (${n}). ${HOW_TO_FIX}`;
  }
  if (!/dev|test/i.test(n)) {
    return `Refusing to run: this local run is connected to database "${n || "(none)"}", which is not a dev/test database. ${HOW_TO_FIX}`;
  }
  return null;
}

/** Throw with the clear message — for startup (next.config.ts) and every bridge call. */
export function assertSafeBridgeUrl(url: string | undefined, env: Record<string, string | undefined> = process.env): void {
  const p = bridgeUrlProblem(url, env);
  if (p) throw new Error(p);
}
