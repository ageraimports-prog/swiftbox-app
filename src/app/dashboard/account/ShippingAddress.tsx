"use client";

import * as React from "react";

const STREET = "11305 NW 122nd Street";
const CITY = "Medley, FL 33178";
const COUNTRY = "USA";

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

function AddressBlock({
  freight,
  name,
  attn,
}: {
  freight: "AIR" | "SEA";
  name: string;
  attn: string;
}) {
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
          {freight}
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
        Use this as your US delivery address when you shop online. Choose AIR for
        speed or SEA for savings.
      </p>
      <div className="flex flex-col gap-3">
        <AddressBlock freight="AIR" name={customerName} attn={`AIR-${accountNo}`} />
        <AddressBlock freight="SEA" name={customerName} attn={`OCEAN-${accountNo}`} />
      </div>
    </section>
  );
}
