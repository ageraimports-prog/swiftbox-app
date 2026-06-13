"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const inputCls =
  "w-full rounded-md border border-gray-200 bg-white px-4 py-3 text-base text-ink placeholder:text-gray-400 focus:outline-none focus:border-green focus:ring-2 focus:ring-green/40";
const labelCls = "mb-1.5 block text-xs font-semibold text-muted";

type Freight = "AIR" | "SEA";

export default function NewPreAlertPage() {
  const router = useRouter();

  const [storeName, setStoreName] = React.useState("");
  const [trackingNumber, setTrackingNumber] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [itemCount, setItemCount] = React.useState("1");
  const [invoiceValueUsd, setInvoiceValueUsd] = React.useState("");
  const [freightType, setFreightType] = React.useState<Freight>("AIR");

  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  function clientValidate(): string | null {
    if (!storeName.trim()) return "Store / merchant name is required.";
    if (!trackingNumber.trim()) return "US tracking number is required.";
    if (!description.trim()) return "Description of contents is required.";
    const count = Number(itemCount);
    if (!Number.isInteger(count) || count < 1)
      return "Number of items must be a whole number of at least 1.";
    const value = Number(invoiceValueUsd);
    if (!Number.isFinite(value) || value <= 0)
      return "Invoice total must be greater than 0.";
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const clientError = clientValidate();
    if (clientError) {
      setError(clientError);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/prealerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeName: storeName.trim(),
          trackingNumber: trackingNumber.trim(),
          description: description.trim(),
          itemCount: Number(itemCount),
          invoiceValueUsd: Number(invoiceValueUsd),
          freightType,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Something went wrong. Please try again.");
        setSubmitting(false);
        return;
      }
      // Back to the list — the new entry loads at the top.
      router.push("/dashboard/prealerts");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/dashboard/prealerts"
        className="flex w-fit items-center gap-1.5 text-sm font-semibold text-muted-dark transition-colors hover:text-mist"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className="h-4 w-4"
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
        </svg>
        Pre-alerts
      </Link>

      <h1 className="sb-disp text-2xl text-mist">New pre-alert</h1>

      <section className="rounded-xl bg-white p-5 shadow-2xl">
        <form onSubmit={handleSubmit} noValidate>
          {error && (
            <div role="alert" className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <label className="mb-4 block">
            <span className={labelCls}>Store / merchant name</span>
            <input
              type="text"
              className={inputCls}
              placeholder="e.g. Amazon"
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              maxLength={100}
              required
            />
          </label>

          <label className="mb-4 block">
            <span className={labelCls}>US tracking number</span>
            <input
              type="text"
              className={inputCls}
              placeholder="Carrier tracking number"
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
              maxLength={100}
              autoCapitalize="characters"
              autoCorrect="off"
              required
            />
          </label>

          <label className="mb-4 block">
            <span className={labelCls}>Description of contents</span>
            <textarea
              className={`${inputCls} min-h-[80px] resize-y`}
              placeholder="What's in the package?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </label>

          <div className="mb-4 flex gap-3">
            <label className="block w-24">
              <span className={labelCls}>Items</span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                className={inputCls}
                value={itemCount}
                onChange={(e) => setItemCount(e.target.value)}
                required
              />
            </label>

            <label className="block flex-1">
              <span className={labelCls}>Invoice total (USD)</span>
              <input
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                className={inputCls}
                placeholder="0.00"
                value={invoiceValueUsd}
                onChange={(e) => setInvoiceValueUsd(e.target.value)}
                required
              />
            </label>
          </div>

          <div className="mb-6">
            <span className={labelCls}>Freight type</span>
            <div
              role="radiogroup"
              aria-label="Freight type"
              className="grid grid-cols-2 gap-1 rounded-md bg-gray-100 p-1"
            >
              {(["AIR", "SEA"] as Freight[]).map((opt) => {
                const active = freightType === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setFreightType(opt)}
                    className={`rounded-[6px] py-2.5 text-sm font-bold transition-colors ${
                      active
                        ? "bg-green text-ink shadow-sm"
                        : "text-muted hover:text-ink"
                    }`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-green px-6 py-3.5 text-sm font-bold text-ink transition-colors hover:bg-green-deep disabled:opacity-60"
          >
            {submitting ? "Submitting…" : "Submit Pre-alert"}
          </button>
        </form>
      </section>
    </div>
  );
}
