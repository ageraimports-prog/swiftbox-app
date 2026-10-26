"use client";

import * as React from "react";
import { addressLine2, miamiAddressFields, miamiAddressText } from "@/lib/miami-address";

// Company line is intentionally omitted from the address for now. If the
// warehouse later requires the company name on the package, flip
// INCLUDE_COMPANY to true — both the display and the clipboard honor it.
const COMPANY = "Swiftbox T&T";
const INCLUDE_COMPANY = false;

/**
 * What "Copy" puts on the clipboard: the same seven labelled fields as the
 * screen, in checkout order (src/lib/miami-address.ts), one per line.
 */
function buildCopyBlock(name: string, ac: string): string {
  const text = miamiAddressText(name, ac);
  return INCLUDE_COMPANY ? `Company: ${COMPANY}\n${text}` : text;
}

function AddressBlock({ name, ac }: { name: string; ac: string }) {
  const [copied, setCopied] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  async function copy() {
    const block = buildCopyBlock(name, ac);
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

      <dl className="mt-3 divide-y divide-mist/10 text-sm">
        {INCLUDE_COMPANY && (
          <div className="flex items-baseline gap-3 py-1.5">
            <dt className="w-28 flex-none text-xs font-semibold uppercase tracking-wide text-muted-dark">
              Company
            </dt>
            <dd className="font-semibold text-mist">{COMPANY}</dd>
          </div>
        )}
        {miamiAddressFields(name, ac).map(([label, value]) => (
          <div key={label} className="flex items-baseline gap-3 py-1.5">
            <dt className="w-28 flex-none text-xs font-semibold uppercase tracking-wide text-muted-dark">
              {label}
            </dt>
            <dd
              className={
                label === "Address line 2"
                  ? "font-bold text-green"
                  : label === "Full name"
                    ? "font-semibold text-mist"
                    : "text-mist"
              }
            >
              {value}
            </dd>
          </div>
        ))}
      </dl>
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
        Use this as your US delivery address when you shop online. Enter each
        line in the matching box at checkout. Always include Address line 2 —{" "}
        <span className="font-semibold text-mist">{addressLine2(accountNo)}</span>{" "}
        — it&apos;s how we know the package is yours.
      </p>
      <div className="flex flex-col gap-3">
        <AddressBlock name={customerName} ac={accountNo} />
      </div>
    </section>
  );
}
