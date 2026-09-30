"use client";

import * as React from "react";
import { toastMessage } from "@/lib/prealert-pick";

/**
 * The pick flow's toast, read from `?toast=` (+ `?left=`) after mount — the same
 * hand-rolled pattern as the login page's "Password updated" banner. Shows for
 * 5 s, then strips the params so a reload doesn't show it again.
 */
export default function QueryToast() {
  const [message, setMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    const url = new URL(window.location.href);
    const msg = toastMessage(url.searchParams.get("toast"), url.searchParams.get("left"));
    if (!msg) return;
    setMessage(msg);
    url.searchParams.delete("toast");
    url.searchParams.delete("left");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }, []);

  // Separate from the read above so a re-run of that effect (React StrictMode
  // in dev) can't cancel the timer after the params are already gone.
  React.useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 5000);
    return () => clearTimeout(t);
  }, [message]);

  if (!message) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-5 top-[max(env(safe-area-inset-top),1rem)] z-30 mx-auto flex max-w-md items-center gap-2 rounded-xl border border-green/30 bg-green/15 px-4 py-3 text-sm font-semibold text-green backdrop-blur"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5 shrink-0" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
      </svg>
      {message}
    </div>
  );
}
