import "server-only";
import { query } from "@/lib/db";
import { BFM_ENABLED_KEY, bfmEnabledFromValue } from "@/lib/bfm-switch-core";

/**
 * THE one reader of the Buy For Me switch in the app (src/lib/bfm-switch-core.ts
 * explains the switch). Never throws: a failed read is OFF.
 */
export async function isBfmEnabled(): Promise<boolean> {
  try {
    const rows = await query<{ setting_value: string | null }>(
      "SELECT setting_value FROM swiftbox_settings WHERE setting_key = :key LIMIT 1",
      { key: BFM_ENABLED_KEY }
    );
    return bfmEnabledFromValue(rows[0]?.setting_value);
  } catch (e) {
    console.error("[bfm-switch] read failed — treating Buy For Me as OFF:", e instanceof Error ? e.message : e);
    return false;
  }
}
