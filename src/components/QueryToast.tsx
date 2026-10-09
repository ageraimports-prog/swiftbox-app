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
  // The "invoice didn't upload" messages are warnings: amber, and on screen longer.
  const [warn, setWarn] = React.useState(false);

  React.useEffect(() => {
    const url = new URL(window.location.href);
    const msg = toastMessage(url.searchParams.get("toast"), url.searchParams.get("left"));
    if (!msg) return;
    setMessage(msg);
    setWarn(["filefail", "alreadyfile", "editfilefail"].includes(url.searchParams.get("toast") ?? ""));
    url.searchParams.delete("toast");
    url.searchParams.delete("left");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }, []);

  // Separate from the read above so a re-run of that effect (React StrictMode
  // in dev) can't cancel the timer after the params are already gone.
  React.useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), warn ? 12000 : 5000);
    return () => clearTimeout(t);
  }, [message, warn]);

  if (!message) return null;
  return (
    <div
      role="status"
      className={`fixed inset-x-5 top-[max(env(safe-area-inset-top),1rem)] z-30 mx-auto flex max-w-md items-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold backdrop-blur ${
        warn ? "border-amber-400/40 bg-amber-400/15 text-amber-200" : "border-green/30 bg-green/15 text-green"
      }`}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5 shrink-0" aria-hidden>
        {warn ? (
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.75h.008M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
        ) : (
          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
        )}
      </svg>
      {message}
    </div>
  );
}
