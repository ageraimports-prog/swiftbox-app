"use client";

import * as React from "react";

/**
 * Referral code card — Sub-piece A. Shows the customer's own code prominently
 * with a WhatsApp share (the primary action, matching Swiftbox customer comms)
 * and a tap-to-copy fallback. Read-only status display is Sub-piece D.
 *
 * The program is double-sided: `welcomeTtd` is what the FRIEND gets off their
 * first shipment, `creditTtd` is what this customer gets once that friend's
 * first package is delivered. Lead with the friend's number — it's the reason
 * anyone accepts a code.
 */
export default function ReferralCard({
  code,
  shareUrl,
  creditTtd,
  welcomeTtd,
}: {
  code: string;
  shareUrl: string;
  creditTtd: number;
  welcomeTtd: number;
}) {
  const [copied, setCopied] = React.useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked (insecure context / permissions) — share still works.
    }
  }

  return (
    <section className="rounded-lg border border-mist/10 bg-ink-2 p-5">
      <h2 className="sb-disp text-lg text-mist">
        Give ${welcomeTtd}, get ${creditTtd}
      </h2>
      <p className="mt-1 text-sm text-muted-dark">
        Share your code with friends and family. They get ${welcomeTtd} off
        their first shipment, and you get ${creditTtd} off your next invoice
        once that package is delivered. Refer as many people as you like.
      </p>

      <button
        type="button"
        onClick={copy}
        aria-label={`Copy your referral code ${code}`}
        className="group mt-2 flex items-center gap-3"
      >
        <span className="sb-disp text-4xl tracking-[0.2em] text-green">
          {code}
        </span>
        <span className="rounded-md border border-mist/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-dark transition-colors group-hover:border-green/40 group-hover:text-green">
          {copied ? "Copied" : "Copy"}
        </span>
      </button>

      <a
        href={shareUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 flex items-center justify-center gap-2 rounded-lg bg-green px-4 py-3 text-sm font-bold text-ink transition-colors hover:bg-green-deep"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden>
          <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.15h-.01a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.11.82.83-3.04-.2-.31a8.22 8.22 0 0 1-1.26-4.38c0-4.54 3.7-8.23 8.24-8.23 2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 0 1 2.41 5.82c0 4.54-3.7 8.23-8.24 8.23Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.51.11-.11.25-.29.37-.43.13-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43-.14-.01-.31-.01-.48-.01a.92.92 0 0 0-.67.31c-.23.25-.88.86-.88 2.1 0 1.23.9 2.42 1.03 2.59.13.17 1.77 2.71 4.3 3.8.6.26 1.07.41 1.43.53.6.19 1.15.16 1.58.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.14-1.18-.06-.1-.22-.16-.47-.28Z" />
        </svg>
        Share on WhatsApp
      </a>
    </section>
  );
}
