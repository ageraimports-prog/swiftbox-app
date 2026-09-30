"use client";

import * as React from "react";

/**
 * Referral share card. The customer's personal invite link
 * (swiftboxtt.com/r/CODE) goes out four ways:
 *
 *   Share on WhatsApp   the main button — wa.me contact picker with the message
 *   More ways to share  the phone's own share sheet (navigator.share); where the
 *                       browser has none, it opens the WhatsApp picker instead
 *   Copy link           copies the WHOLE message + link, not just the code
 *   Show QR code        the link as a QR, drawn on our server (no outside
 *                       service), for sharing in person
 *
 * Each tap is reported to /api/referral/share (a beacon; it can never block or
 * fail the share) so the office can see how many customers share at all.
 *
 * The program is double-sided: `welcomeTtd` is what the FRIEND gets toward
 * their first invoice, `creditTtd` is what this customer gets once that
 * friend's first package is delivered. Lead with the friend's number.
 */
type Channel = "whatsapp" | "share_sheet" | "copy" | "qr";

function reportShare(channel: Channel) {
  try {
    const body = JSON.stringify({ channel });
    if (!navigator.sendBeacon?.("/api/referral/share", new Blob([body], { type: "application/json" }))) {
      void fetch("/api/referral/share", { method: "POST", body, keepalive: true }).catch(() => {});
    }
  } catch {
    /* tracking must never break sharing */
  }
}

export default function ReferralCard({
  code,
  shareUrl,
  inviteLink,
  message,
  qrSvg,
  creditTtd,
  welcomeTtd,
}: {
  code: string;
  shareUrl: string;
  inviteLink: string;
  message: string;
  qrSvg: string | null;
  creditTtd: number;
  welcomeTtd: number;
}) {
  const [copied, setCopied] = React.useState(false);
  const [showQr, setShowQr] = React.useState(false);
  const [canShare, setCanShare] = React.useState(false);

  React.useEffect(() => {
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  async function copyLink() {
    reportShare("copy");
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked (insecure context / permissions) — the link is shown below to copy by hand.
    }
  }

  async function shareSheet() {
    reportShare("share_sheet");
    try {
      await navigator.share({ text: message });
    } catch (e) {
      // AbortError = the customer closed the sheet; anything else → WhatsApp.
      if (!(e instanceof DOMException && e.name === "AbortError")) window.open(shareUrl, "_blank", "noopener");
    }
  }

  function toggleQr() {
    if (!showQr) reportShare("qr");
    setShowQr((v) => !v);
  }

  const secondary =
    "flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-mist/15 px-3 py-2.5 text-sm font-semibold text-mist transition-colors hover:border-green/40 hover:text-green";

  return (
    <section className="rounded-lg border border-mist/10 bg-ink-2 p-5">
      <h2 className="sb-disp text-lg text-mist">
        Give ${welcomeTtd}, get ${creditTtd}
      </h2>
      <p className="mt-1 text-sm text-muted-dark">
        Send friends and family your invite link. They get ${welcomeTtd} toward
        their first Swiftbox invoice, and you get ${creditTtd} off your next invoice
        once their first package is delivered. Refer as many people as you like.
      </p>

      <p className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-muted-dark">Your code</p>
      <p className="sb-disp text-4xl tracking-[0.2em] text-green">{code}</p>

      <a
        href={shareUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => reportShare("whatsapp")}
        className="mt-4 flex items-center justify-center gap-2 rounded-lg bg-green px-4 py-3 text-sm font-bold text-ink transition-colors hover:bg-green-deep"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden>
          <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.15h-.01a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.11.82.83-3.04-.2-.31a8.22 8.22 0 0 1-1.26-4.38c0-4.54 3.7-8.23 8.24-8.23 2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 0 1 2.41 5.82c0 4.54-3.7 8.23-8.24 8.23Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.51.11-.11.25-.29.37-.43.13-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43-.14-.01-.31-.01-.48-.01a.92.92 0 0 0-.67.31c-.23.25-.88.86-.88 2.1 0 1.23.9 2.42 1.03 2.59.13.17 1.77 2.71 4.3 3.8.6.26 1.07.41 1.43.53.6.19 1.15.16 1.58.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.14-1.18-.06-.1-.22-.16-.47-.28Z" />
        </svg>
        Share on WhatsApp
      </a>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {canShare && (
          <button type="button" onClick={shareSheet} className={secondary}>
            More ways to share
          </button>
        )}
        <button type="button" onClick={copyLink} className={secondary} aria-live="polite">
          {copied ? "Copied!" : "Copy link"}
        </button>
        {qrSvg && (
          <button type="button" onClick={toggleQr} className={secondary} aria-expanded={showQr}>
            {showQr ? "Hide QR code" : "Show QR code"}
          </button>
        )}
      </div>

      {showQr && qrSvg && (
        <div className="mt-4 flex flex-col items-center gap-2">
          <div
            className="w-56 max-w-full rounded-lg bg-white p-3"
            role="img"
            aria-label={`QR code for ${inviteLink}`}
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
          <p className="text-center text-xs text-muted-dark">
            Let a friend scan this with their phone camera to open your invite.
          </p>
        </div>
      )}

      <p className="mt-3 break-all text-center text-xs text-muted-dark">{inviteLink}</p>
    </section>
  );
}
