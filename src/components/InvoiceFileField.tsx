"use client";

import * as React from "react";
import { PREALERT_FILE_ACCEPT, PREALERT_FILE_MAX_BYTES } from "@/lib/prealert-file";

/**
 * Optional invoice/receipt on a pre-alert form. Hidden until the upload is
 * switched on (GET /api/prealerts/uploads). Choosing a file never blocks the
 * submit: the pre-alert is saved first and `uploadPrealertFile` attaches the
 * file afterwards. A file that can't be used is refused on selection, with a
 * message, and the form carries on without it.
 */

/** Phone photos are often 3–8 MB: shrink big images so they fit the 4 MB limit (as Buy For Me slips do). */
async function shrinkIfNeeded(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size <= 1_500_000) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.85));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file; // the server still checks the real type and size
  }
}

/** Attach the chosen file to a saved pre-alert. true = stored. Never throws; gives up after 45 s. */
export async function uploadPrealertFile(prealertId: number, file: File): Promise<boolean> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 45_000);
  try {
    const form = new FormData();
    form.append("file", file, file.name);
    const res = await fetch(`/api/prealerts/${prealertId}/file`, { method: "POST", body: form, signal: abort.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Is the upload switched on? Checked once per form. */
export function useUploadsEnabled(): boolean {
  const [enabled, setEnabled] = React.useState(false);
  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/prealerts/uploads")
      .then((r) => (r.ok ? r.json() : { enabled: false }))
      .then((d) => {
        if (!cancelled) setEnabled(d?.enabled === true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return enabled;
}

const labelCls = "mb-1.5 block text-xs font-semibold text-muted";

export default function InvoiceFileField({
  file,
  onChange,
  disabled,
  onBusy,
}: {
  file: File | null;
  onChange: (file: File | null) => void;
  disabled?: boolean;
  /** true while a photo is being shrunk — the form holds its submit so the file isn't dropped. */
  onBusy?: (busy: boolean) => void;
}) {
  const ref = React.useRef<HTMLInputElement>(null);
  const [note, setNote] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function pick(f: File | undefined) {
    setNote(null);
    if (!f) return;
    if (!PREALERT_FILE_ACCEPT.split(",").includes(f.type)) {
      setNote("Please choose a photo (JPG, PNG or WebP) or a PDF.");
      return;
    }
    setBusy(true);
    onBusy?.(true);
    const small = await shrinkIfNeeded(f);
    setBusy(false);
    onBusy?.(false);
    if (small.size > PREALERT_FILE_MAX_BYTES) {
      setNote("That file is too big — please choose one under 4 MB.");
      return;
    }
    onChange(small);
  }

  return (
    <div className="mb-6">
      <span className={labelCls}>Invoice or receipt (optional)</span>
      <input
        ref={ref}
        type="file"
        accept={PREALERT_FILE_ACCEPT}
        className="hidden"
        onChange={(e) => {
          void pick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {file ? (
        <div className="flex items-center gap-3 rounded-md border border-gray-200 bg-gray-50 px-4 py-3">
          <span className="min-w-0 flex-1 truncate text-sm text-ink">{file.name}</span>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(null)}
            className="shrink-0 text-xs font-semibold text-muted underline hover:text-ink"
          >
            Remove
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => ref.current?.click()}
          className="w-full rounded-md border border-dashed border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-muted transition-colors hover:border-green hover:text-ink disabled:opacity-60"
        >
          {busy ? "Preparing…" : "Add a photo or PDF of your invoice"}
        </button>
      )}
      <span className="mt-1.5 block text-xs text-muted">
        {note ?? "A photo or screenshot of your invoice or receipt, or a PDF."}
      </span>
    </div>
  );
}
