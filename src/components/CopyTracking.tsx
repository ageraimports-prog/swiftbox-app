"use client";

import * as React from "react";
import { CarrierTag } from "@/components/PackageCard";
import type { TrackingNumber } from "@/lib/packageDisplay";

/** Clipboard write with the old-textarea fallback in-app webviews still need. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    document.body.removeChild(ta);
    return ok;
  }
}

/**
 * The full tracking number(s) on a detail screen, each with a tap-to-copy
 * button and a "Tracking number copied" toast.
 */
export default function CopyTracking({ numbers }: { numbers: TrackingNumber[] }) {
  const [toast, setToast] = React.useState<string | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  async function copy(num: string) {
    const ok = await copyText(num);
    setToast(ok ? "Tracking number copied" : "Couldn't copy — press and hold the number instead");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 2500);
  }

  return (
    <>
      <ul className="flex flex-col gap-1.5">
        {numbers.map((t) => (
          <li key={t.number} className="flex items-center gap-2">
            {t.carrier && <CarrierTag carrier={t.carrier} />}
            <span className="min-w-0 break-all font-mono text-sm font-medium tabular-nums text-mist select-all">
              {t.number}
            </span>
            <button
              type="button"
              onClick={() => copy(t.number)}
              aria-label={`Copy tracking number ${t.number}`}
              className="-m-1.5 shrink-0 rounded-md p-1.5 text-muted-dark transition-colors hover:text-mist active:text-green"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4" aria-hidden>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75"
                />
              </svg>
            </button>
          </li>
        ))}
      </ul>

      {toast && (
        <div
          role="status"
          className="fixed inset-x-5 top-[max(env(safe-area-inset-top),1rem)] z-30 mx-auto flex max-w-md items-center gap-2 rounded-xl border border-green/30 bg-green/15 px-4 py-3 text-sm font-semibold text-green backdrop-blur"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5 shrink-0" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
          {toast}
        </div>
      )}
    </>
  );
}
