/**
 * Dev tool: drive this app's Consolidated Billing module (src/lib/consolidation.ts)
 * from the command line — the SAME functions /api/consolidation and
 * /api/consolidation/release call. Used by SwiftboxAdmin's
 * scripts/verify-consolidation-live.ts for the live click-through, because the
 * customer's password is not something a script holds.
 *
 *   NODE_OPTIONS=--conditions=react-server npx tsx scripts/consolidation-cli.ts state   <userId>
 *   NODE_OPTIONS=--conditions=react-server npx tsx scripts/consolidation-cli.ts optin   <userId> <on|off> <firstName> <email>
 *   NODE_OPTIONS=--conditions=react-server npx tsx scripts/consolidation-cli.ts release <userId> <firstName> <email>
 *   NODE_OPTIONS=--conditions=react-server npx tsx scripts/consolidation-cli.ts held    <userId>
 *
 * Run from the SwiftboxApp folder (so "@/..." resolves and .env.local loads).
 * The react-server condition makes `import "server-only"` load its empty module.
 * Prints one JSON line.
 */
import { loadEnvConfig } from "@next/env";

async function main() {
  loadEnvConfig(process.cwd(), true);
  const c = await import("../src/lib/consolidation");
  const [cmd, uid, a, b, d] = process.argv.slice(2);
  const userId = Number(uid);
  if (!Number.isInteger(userId) || userId <= 0) throw new Error("userId required");
  let out: unknown;
  if (cmd === "state") out = await c.getConsolidationState(userId);
  else if (cmd === "optin") out = await c.setOptIn(userId, a === "on", b ?? "", d ?? "");
  else if (cmd === "release") out = { released: await c.releaseOpenGroup(userId, a ?? "", b ?? "") };
  else if (cmd === "held") out = [...(await c.heldPackageIds(userId))];
  else throw new Error("usage: state|optin|release|held <userId> ...");
  console.log(JSON.stringify(out));
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
