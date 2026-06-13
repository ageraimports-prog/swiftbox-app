import "server-only";
import { Resend } from "resend";

/** Transactional email via Resend. RESEND_API_KEY + RESEND_FROM live in env. */

function resendClient(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not set");
  return new Resend(key);
}

function fromAddress(): string {
  // onboarding@resend.dev until swiftboxtt.com is verified in Resend.
  return process.env.RESEND_FROM ?? "onboarding@resend.dev";
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

export async function sendPasswordResetEmail(
  to: string,
  firstName: string,
  resetUrl: string
): Promise<{ id: string }> {
  const { data, error } = await resendClient().emails.send({
    from: `Swiftbox <${fromAddress()}>`,
    to,
    subject: "Reset your Swiftbox password",
    html: resetEmailHtml(firstName, resetUrl),
  });
  if (error) {
    throw new Error(`Resend error: ${error.message ?? JSON.stringify(error)}`);
  }
  return { id: data?.id ?? "" };
}
