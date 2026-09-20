"use client";

import * as React from "react";

const STREET = "6175 NW 167th ST STE G36";
const CITY = "Hialeah, FL 33015";
const COUNTRY = "USA";

/**
 * Address Line 2, formatted exactly as the website's `addressLine2` does it
 * (SwiftBox Rebranded Website, src/lib/miamiAddress.ts) — the unit repeated,
 * then the account code: strip anything that is not a digit, then pad to at
 * least four. Airdrop changed the separator hyphen -> colon on 2026-09-19 and
 * asked for "UNIT G36" at the head of the line; the padding is unchanged.
 *
 * `users.ac` is not clean: on live, 5 accounts are stored two digits wide and 3
 * carry a leading tab. Interpolating the raw value printed `SWIFT-18` here while
 * the welcome email and the verify screen said `SWIFT-0018`, and `SWIFT-<tab>33843`
 * for the tabbed ones. This is the field the warehouse matches a package on, so
 * the two surfaces disagreeing is a lost package, not a cosmetic difference.
 */
function swiftLabel(ac: string): string {
  const digits = String(ac ?? "").replace(/\D+/g, "");
  return `UNIT G36 SWIFT: ${digits.padStart(4, "0")}`;
}

// Company line is intentionally omitted from the address block for now (the
// customer's name is Address Line 1). If the warehouse later requires the
// company name on the package, flip INCLUDE_COMPANY to true — both the display
// and clipboard builders honor it.
const COMPANY = "Swiftbox T&T";
const INCLUDE_COMPANY = false;

/**
 * The clean address pushed to the clipboard — NO on-screen labels, one value
 * per line, ready to paste into a checkout form. Built separately from the
 * labeled display so the two never drift into each other.
 */
function buildCopyBlock(name: string, attn: string): string {
  const lines = [name, attn, STREET, CITY, COUNTRY];
  if (INCLUDE_COMPANY) lines.unshift(COMPANY);
  return lines.join("\n");
}

function AddressBlock({ name, attn }: { name: string; attn: string }) {
  const [copied, setCopied] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  async function copy() {
    const block = buildCopyBlock(name, attn);
    try {
      await navigator.clipboard.writeText(block);
    } catch {
      // Fallback for browsers without the async clipboard API.
      const ta = document.createElement("textarea");
      ta.value = block;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        /* ignore */
      }
      document.body.removeChild(ta);
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rounded-lg border border-mist/10 bg-ink-2 p-4">
      <div className="flex items-center justify-between">
        <span className="rounded-sm bg-green/10 px-2 py-0.5 text-xs font-bold text-green">
          MIAMI
        </span>
        <button
          type="button"
          onClick={copy}
          aria-live="polite"
          className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${
            copied
              ? "bg-green/15 text-green"
              : "border border-green/40 text-green hover:bg-green/10"
          }`}
        >
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>

      <div className="mt-3 text-sm leading-relaxed">
        {INCLUDE_COMPANY && (
          <p className="font-semibold text-mist">{COMPANY}</p>
        )}
        <p>
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-dark">
            Address Line 1:{" "}
          </span>
          <span className="font-semibold text-mist">{name}</span>
        </p>
        <p>
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-dark">
            Address Line 2:{" "}
          </span>
          <span className="font-bold text-green">{attn}</span>
        </p>
        <p className="mt-1 text-muted-dark">{STREET}</p>
        <p className="text-muted-dark">{CITY}</p>
        <p className="text-muted-dark">{COUNTRY}</p>
      </div>
    </div>
  );
}

export default function ShippingAddress({
  accountNo,
  customerName,
}: {
  accountNo: string;
  customerName: string;
}) {
  return (
    <section>
      <h2 className="sb-disp mb-1 text-lg text-mist">Your shipping address</h2>
      <p className="mb-3 text-xs text-muted-dark">
        Use this as your US delivery address when you shop online. Always put
        your SWIFT code in Address Line 2 so we match every package to you.
      </p>
      <div className="flex flex-col gap-3">
        <AddressBlock name={customerName} attn={swiftLabel(accountNo)} />
      </div>
    </section>
  );
}
