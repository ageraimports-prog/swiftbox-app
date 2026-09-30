import "server-only";

/**
 * Report a referral share tap to SwiftboxAdmin, the ONE writer of the funnel
 * table (swiftbox_referral_events). POST /api/referral/event, gated by the
 * shared REFERRAL_HOOK_KEY (set in both Vercel projects) — the same pattern as
 * the consolidation release hook. The admin resolves the referrer from the code
 * itself and ignores unknown codes.
 *
 * Never throws and gives up after 2.5 s: a share must work whether or not the
 * tap is counted.
 */
export const SHARE_CHANNELS = ["whatsapp", "share_sheet", "copy", "qr"] as const;
export type ShareChannel = (typeof SHARE_CHANNELS)[number];

export function isShareChannel(v: unknown): v is ShareChannel {
  return typeof v === "string" && (SHARE_CHANNELS as readonly string[]).includes(v);
}

export async function reportShareTap(input: {
  code: string;
  channel: ShareChannel;
  ip: string;
  userAgent: string;
}): Promise<void> {
  const key = process.env.REFERRAL_HOOK_KEY ?? "";
  if (!key) return;
  const base = (process.env.ADMIN_URL || "https://admin.swiftboxtt.com").replace(/\/+$/, "");
  try {
    await fetch(`${base}/api/referral/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-referral-key": key },
      body: JSON.stringify({ event: "share_tap", ...input }),
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    });
  } catch {
    /* tracking only */
  }
}
