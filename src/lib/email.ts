import nodemailer, { type Transporter } from "nodemailer";

/**
 * Transactional email via the cPanel mailbox (SMTP_* env vars).
 *
 * Transport (ported from the Admin repo's proven config):
 *   - port 465 → secure: true   (implicit TLS)
 *   - port 587 → secure: false  + STARTTLS (requireTLS)
 *
 * cPanel sender-verify gotcha: the server rejects mail whose envelope MAIL FROM
 * isn't a real local mailbox. SMTP_FROM's display address (noreply@) may not
 * exist as a mailbox, so the envelope sender is set to SMTP_USER (the
 * authenticated mailbox, info@) while the visible "From" header stays SMTP_FROM.
 * Same domain, so SPF stays aligned.
 *
 * Not marked "server-only" so the transport can be verified in isolation from a
 * script; it is only ever imported from server code in the app.
 */

let cached: Transporter | null = null;

export function getTransport(): Transporter {
  if (cached) return cached;

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 465);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) {
    throw new Error("SMTP_HOST / SMTP_USER / SMTP_PASS are not configured");
  }

  cached = nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // 465 = implicit TLS; 587 = STARTTLS (below)
    requireTLS: port === 587,
    auth: { user, pass },
  });
  return cached;
}

/** Confirms the SMTP credentials/connection are valid. */
export function verifyTransport(): Promise<true> {
  return getTransport().verify();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function resetEmailHtml(firstName: string, resetUrl: string): string {
  const name = escapeHtml(firstName);
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#0E1114;font-family:Archivo,Arial,Helvetica,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#0E1114;padding:32px 0;">
      <tr>
        <td align="center">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:480px;">
            <tr>
              <td style="padding:0 24px 20px;">
                <span style="font-size:22px;font-weight:800;letter-spacing:-0.5px;color:#F4F5F2;">swift<span style="color:#00FF40;">box</span></span>
              </td>
            </tr>
            <tr>
              <td style="background:#1A2020;border-radius:18px;padding:32px 24px;border:1px solid rgba(244,245,242,0.08);">
                <h1 style="margin:0 0 12px;font-size:20px;font-weight:800;color:#F4F5F2;">Reset your password</h1>
                <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#8A9A8A;">
                  Hi ${name}, you requested a password reset. Click the button below to set a new password. This link expires in 1 hour.
                </p>
                <table cellpadding="0" cellspacing="0" role="presentation" style="margin:4px 0 22px;">
                  <tr>
                    <td style="border-radius:12px;background:#00FF40;">
                      <a href="${resetUrl}" style="display:inline-block;padding:14px 30px;font-size:14px;font-weight:700;color:#0E1114;text-decoration:none;border-radius:12px;">Reset Password</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0;font-size:12px;line-height:1.6;color:#6B7280;">
                  If you didn&rsquo;t request this, you can safely ignore this email &mdash; your password won&rsquo;t change.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 24px;font-size:11px;color:#6B7280;">
                &copy; Swiftbox T&amp;T &middot; Trinidad &amp; Tobago
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/** Sends the password-reset email via the cPanel transport. Throws on failure. */
export async function sendPasswordResetEmail(
  to: string,
  firstName: string,
  resetUrl: string
): Promise<{ id: string }> {
  const from = process.env.SMTP_FROM || "Swift Box <noreply@swiftboxtt.com>";
  // Envelope sender = authenticated mailbox so cPanel sender-verify passes.
  const envelopeFrom = process.env.SMTP_USER || undefined;
  const info = await getTransport().sendMail({
    from,
    to,
    subject: "Reset your Swiftbox password",
    html: resetEmailHtml(firstName, resetUrl),
    ...(envelopeFrom ? { envelope: { from: envelopeFrom, to } } : {}),
  });
  return { id: info.messageId ?? "" };
}
