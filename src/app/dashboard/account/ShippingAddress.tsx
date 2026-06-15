"use client";

import * as React from "react";

const STREET = "11305 NW 122nd Street";
const CITY = "Medley, FL 33178";
const COUNTRY = "USA";

/** The exact multi-line block placed on the clipboard. */
function buildBlock(attn: string): string {
  return ["Swiftbox T&T", attn, STREET, CITY, COUNTRY].join("\n");
}

function AddressBlock({ freight, attn }: { freight: "AIR" | "SEA"; attn: string }) {
  const [copied, setCopied] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  async function copy() {
    const block = buildBlock(attn);
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
        <p className="font-semibold text-mist">Swiftbox T&amp;T</p>
        <p className="font-bold text-green">{attn}</p>
        <p className="text-muted-dark">{STREET}</p>
        <p className="text-muted-dark">{CITY}</p>
        <p className="text-muted-dark">{COUNTRY}</p>
      </div>
    </div>
  );
}

export default function ShippingAddress({ accountNo }: { accountNo: string }) {
  return (
    <section>
      <h2 className="sb-disp mb-1 text-lg text-mist">Your shipping address</h2>
      <p className="mb-3 text-xs text-muted-dark">
        Use this as your US delivery address when you shop online. Choose AIR for
        speed or SEA for savings.
      </p>
      <div className="flex flex-col gap-3">
        <AddressBlock freight="AIR" attn={`AIR-${accountNo}`} />
        <AddressBlock freight="SEA" attn={`OCEAN-${accountNo}`} />
      </div>
    </section>
  );
}
