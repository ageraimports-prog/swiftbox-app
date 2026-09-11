import { getTransport } from "./email";

/**
 * Account-deletion request emails.
 *
 * Google Play requires every app that lets users create an account to offer an
 * in-app deletion path AND a publicly reachable web page where deletion can be
 * requested (/delete-account). Requests land in the support inbox rather than
 * deleting rows directly: Swiftbox is a licensed customs broker and entry
 * records carry a statutory retention period, so a human has to separate
 * "close the account and purge the profile" from "keep the customs filings".
 */

export type DeletionRequest = {
  name: string;
  email: string;
  accountNo?: string;
  reason?: string;
  /** "app" when raised from inside the signed-in app, "web" from the public page. */
  source: "app" | "web";
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const SUPPORT_INBOX =
  process.env.ACCOUNT_DELETION_INBOX || process.env.SMTP_USER || "info@swiftboxtt.com";

/** Notifies support that a customer asked for their account to be deleted. */
export async function sendDeletionRequestToSupport(
  req: DeletionRequest
): Promise<void> {
  const from = process.env.SMTP_FROM || "Swift Box <noreply@swiftboxtt.com>";
  const envelopeFrom = process.env.SMTP_USER || undefined;
  const rows: [string, string][] = [
    ["Name", req.name],
    ["Email", req.email],
    ["Account #", req.accountNo || "—"],
    ["Raised from", req.source === "app" ? "Signed-in app" : "Public web form"],
    ["Reason", req.reason || "—"],
    ["Received", new Date().toISOString()],
  ];

  const html = `<!doctype html>
<html><body style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;">
  <h2 style="margin:0 0 12px;">Account deletion request</h2>
  <table cellpadding="6" cellspacing="0" style="border-collapse:collapse;">
    ${rows
      .map(
        ([k, v]) =>
          `<tr><td style="border:1px solid #ddd;font-weight:bold;">${escapeHtml(
            k
          )}</td><td style="border:1px solid #ddd;">${escapeHtml(v)}</td></tr>`
      )
      .join("")}
  </table>
  <p style="margin-top:16px;color:#555;">
    Google Play policy: action this within 30 days. Delete the profile, address book,
    pre-alerts and referral records; retain customs entries only where law requires,
    then reply to the customer confirming what was removed and what was kept.
  </p>
</body></html>`;

  await getTransport().sendMail({
    from,
    to: SUPPORT_INBOX,
    replyTo: req.email,
    subject: `Account deletion request — ${req.email}${
      req.accountNo ? ` (#${req.accountNo})` : ""
    }`,
    html,
    ...(envelopeFrom
      ? { envelope: { from: envelopeFrom, to: SUPPORT_INBOX } }
      : {}),
  });
}

/** Acknowledges the request to the customer so they have a record of it. */
export async function sendDeletionAcknowledgement(
  req: DeletionRequest
): Promise<void> {
  const from = process.env.SMTP_FROM || "Swift Box <noreply@swiftboxtt.com>";
  const envelopeFrom = process.env.SMTP_USER || undefined;
  const name = escapeHtml(req.name.split(" ")[0] || "there");

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#0E1114;font-family:Archivo,Arial,Helvetica,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#0E1114;padding:32px 0;">
      <tr><td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:480px;">
          <tr><td style="padding:0 24px 20px;">
            <span style="font-size:22px;font-weight:800;letter-spacing:-0.5px;color:#F4F5F2;">swift<span style="color:#00FF40;">box</span></span>
          </td></tr>
          <tr><td style="background:#1A2020;border-radius:18px;padding:32px 24px;border:1px solid rgba(244,245,242,0.08);">
            <h1 style="margin:0 0 12px;font-size:20px;font-weight:800;color:#F4F5F2;">We got your deletion request</h1>
            <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#8A9A8A;">
              Hi ${name}, we&rsquo;ve received your request to delete your Swiftbox account.
              We&rsquo;ll close it and remove your profile, addresses, pre-alerts and referral
              records within 30 days, and email you when it&rsquo;s done.
            </p>
            <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#8A9A8A;">
              One thing we can&rsquo;t remove: as a licensed customs broker we are required to
              keep customs entry records for shipments already cleared in your name. Those stay
              on file for the statutory period and are not used for anything else.
            </p>
            <p style="margin:0;font-size:14px;line-height:1.6;color:#8A9A8A;">
              If you have packages in transit or an unpaid balance, we&rsquo;ll contact you first
              to settle those before closing the account.
            </p>
          </td></tr>
          <tr><td style="padding:20px 24px;font-size:11px;color:#6B7280;">
            &copy; Swiftbox T&amp;T &middot; Trinidad &amp; Tobago
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  await getTransport().sendMail({
    from,
    to: req.email,
    subject: "Your Swiftbox account deletion request",
    html,
    ...(envelopeFrom ? { envelope: { from: envelopeFrom, to: req.email } } : {}),
  });
}
