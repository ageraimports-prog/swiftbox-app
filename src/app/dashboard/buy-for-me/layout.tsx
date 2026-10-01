import { isBfmEnabled } from "@/lib/bfm-switch";
import { BfmEnabledProvider } from "./paused";

/**
 * Reads the Buy For Me switch once per request for every page under
 * /dashboard/buy-for-me (src/lib/bfm-switch-core.ts). While it is OFF:
 *   /new          → the paused message, no form
 *   the list      → the paused message; existing requests still listed, read-only
 *   a request     → shown read-only, no payment asked for
 * The API refuses the writes on its own; this only decides what is shown.
 */
export const dynamic = "force-dynamic";

export default async function BuyForMeLayout({ children }: { children: React.ReactNode }) {
  const enabled = await isBfmEnabled();
  return <BfmEnabledProvider enabled={enabled}>{children}</BfmEnabledProvider>;
}
