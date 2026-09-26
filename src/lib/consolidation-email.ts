import { getTransport } from "@/lib/email";

/**
 * The RELEASED notice, sent when the customer releases their held packages from
 * the app ("Deliver what's here now", or turning Consolidated Billing off). The
 * admin sends the same notice for every other release — keep the wording in step
 * with SwiftboxAdmin/lib/consolidation-email.ts.
 */

function esc(v: unknown): string {
  return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function releasedEmailHtml(firstName: string, count: number): string {
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f4f5f2;font-family:Arial,Helvetica,sans-serif;color:#111827;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f2;padding:24px 0;">
      <tr><td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #e5e7eb;">
          <tr><td align="center" style="background:#0b5cab;padding:22px 24px;">
            <img src="https://livetracker.swiftboxtt.com/assets/swiftbox-logo-white.png" alt="Swiftbox" width="180" style="display:block;margin:0 auto;border:0;" />
            <div style="margin-top:8px;font-size:11px;letter-spacing:3px;color:#cfe6ff;text-transform:uppercase;">Consolidated Billing</div>
          </td></tr>
          <tr><td style="padding:28px 28px 8px 28px;">
            <p style="margin:0 0 14px 0;font-size:16px;">Hello ${esc(firstName)},</p>
            <p style="margin:0 0 12px 0;font-size:14px;color:#374151;line-height:1.55;">You asked us to deliver what's here now.</p>
            <p style="margin:0 0 12px 0;font-size:15px;font-weight:700;color:#0b5cab;">${count === 1 ? "1 package" : `${count} packages`} — one invoice, one delivery</p>
            <p style="margin:0 0 12px 0;font-size:14px;color:#374151;line-height:1.55;">We'll send your consolidated invoice shortly and schedule a single delivery.</p>
          </td></tr>
          <tr><td align="center" style="padding:22px 28px 28px 28px;">
            <p style="margin:0;font-size:13px;color:#6b7280;">Stay in touch &mdash; <a href="https://swiftboxtt.com" style="color:#0b5cab;text-decoration:none;font-weight:600;">swiftboxtt.com</a></p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

/** Throws on SMTP failure — the caller decides. */
export async function sendConsolidationReleasedEmail(d: { to: string; firstName: string; count: number }) {
  const from = process.env.SMTP_FROM || "Swift Box <noreply@swiftboxtt.com>";
  const envelopeFrom = process.env.SMTP_USER || undefined;
  return getTransport().sendMail({
    from,
    to: d.to,
    subject: `Your ${d.count === 1 ? "package is" : `${d.count} packages are`} released for delivery`,
    html: releasedEmailHtml(d.firstName, d.count),
    ...(envelopeFrom ? { envelope: { from: envelopeFrom, to: d.to } } : {}),
  });
}
