/**
 * "Send my packages now" — what POST /api/consolidated-billing/release accepts.
 * PURE (tested in sendMyPackagesNow.test.ts).
 *
 * The request must say the customer CONFIRMED (Brent, 2026-10-13): the button
 * closes the group, and customers were pressing it without knowing that. The
 * app only sends `confirmed: true` from the confirmation's "Yes, send these now";
 * anything else — an old cached screen, a script, a stray tap — is refused here
 * and nothing reaches the admin.
 */
export const SEND_NOW_UNCONFIRMED = "Please confirm first: this closes your current group.";

export type SendNowRequest = { ok: true; groupId: number } | { ok: false; error: string };

export function parseSendNowRequest(body: unknown): SendNowRequest {
  const b = (body ?? {}) as { groupId?: unknown; confirmed?: unknown };
  const groupId = Number(b.groupId);
  if (!Number.isInteger(groupId) || groupId <= 0) return { ok: false, error: "groupId is required" };
  if (b.confirmed !== true) return { ok: false, error: SEND_NOW_UNCONFIRMED };
  return { ok: true, groupId };
}
