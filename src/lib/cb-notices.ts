import { query, execute } from "@/lib/db";

/**
 * Consolidated Billing reminders as in-app notices (Brent, 2026-11-27 — admin
 * CB_VERDICT_PLAN.md Part C). The ADMIN writes swiftbox_cb_reminders (migration 122);
 * a row with channel 'app' IS the notice. This file only reads them and marks one read.
 * Before 122 exists every read answers nothing (the Notices page looks as before).
 *
 * Wording lives with the admin (lib/cb-reminders-core.ts reminderNotice) and is copied
 * here as CB_NOTICE_COPY — no package count, no place, no shipment detail, one button.
 */
export type CbNotice = { id: number; kind: string; title: string; body: string; unread: boolean; sentAt: string };

export const CB_NOTICE_BUTTON = "Send my packages";
export const CB_NOTICE_URL = "/dashboard?send=1#consolidated-billing";

/** Byte-for-byte the admin's reminderCopy title + lines (tested in cb-notices.test.ts). */
export const CB_NOTICE_COPY: Record<string, { title: string; body: string }> = {
  switched_on: { title: "Consolidated Billing is on", body: "From now on we'll keep your packages together and deliver them on one bill. They won't go out one by one. When you're ready, tap Send and we'll deliver them together." },
  ready: { title: "Your packages are ready", body: "Your packages are ready. Tap Send and we'll deliver them together." },
  day7: { title: "Consolidated Billing is still on", body: "We're still keeping your packages together so they come on one bill. Whenever you're ready, tap Send and we'll deliver them together." },
  day14: { title: "Consolidated Billing is still on", body: "We're still keeping your packages together so they come on one bill. Whenever you're ready, tap Send and we'll deliver them together." },
  day18: { title: "Your packages go out together in 2 days", body: "In 2 days we'll send your packages together on one bill. Want them sooner? Tap Send and we'll deliver them together now." },
  day20: { title: "Your packages are on the way", body: "Your 20 days are up, so we've sent your packages together on one bill. They're on the way. Consolidated Billing is now off. You can turn it on again anytime in the Swiftbox app." },
};

export async function cbNotices(userId: number): Promise<CbNotice[]> {
  try {
    const rows = await query<{ reminder_id: number; kind: string; app_status: string | null; sent_at: string | null }>(
      `SELECT reminder_id, kind, app_status, DATE_FORMAT(sent_at, '%Y-%m-%d %H:%i:%s') AS sent_at FROM swiftbox_cb_reminders
        WHERE user_id = :u AND channel = 'app' AND status = 'sent' ORDER BY reminder_id DESC LIMIT 50`,
      { u: userId }
    );
    return rows.filter((r) => CB_NOTICE_COPY[r.kind]).map((r) => ({
      id: Number(r.reminder_id), kind: r.kind, ...CB_NOTICE_COPY[r.kind],
      unread: r.app_status === "unread", sentAt: String(r.sent_at ?? ""),
    }));
  } catch {
    return [];
  }
}

export async function unreadCbNoticeCount(userId: number): Promise<number> {
  try {
    const [r] = await query<{ n: number }>(
      "SELECT COUNT(*) AS n FROM swiftbox_cb_reminders WHERE user_id = :u AND channel = 'app' AND status = 'sent' AND app_status = 'unread'",
      { u: userId }
    );
    return Number(r?.n ?? 0);
  } catch {
    return 0;
  }
}

/** The customer's only write: mark their own notice read. */
export async function markCbNoticeRead(userId: number, id: number): Promise<void> {
  await execute(
    "UPDATE swiftbox_cb_reminders SET app_status = 'read', read_at = UTC_TIMESTAMP() WHERE reminder_id = :id AND user_id = :u AND channel = 'app' AND app_status = 'unread'",
    { id, u: userId }
  );
}
