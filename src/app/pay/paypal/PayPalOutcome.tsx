"use client";

import * as React from "react";
import Link from "next/link";
import AuthLayout from "@/components/AuthLayout";

/**
 * The screen a customer lands on back from PayPal (admin PAYPAL_PAYMENTS_PLAN.md
 * rule 10): success / cancelled / pending / declined / already paid / failed, in
 * plain words. It lives OUTSIDE /dashboard so it works without a session cookie
 * (installed iOS web app, Android TWA custom tab): the signed link is the proof,
 * and the capture happens on the server. Reloading it is safe — the admin answers
 * the same outcome and never captures twice.
 */
type Answer = { outcome: string; message: string; invoiceNo?: string; amountTtd?: number; amountUsd?: number; fxLine?: string };

const TITLE: Record<string, string> = {
  paid: "Payment received",
  pending: "Payment pending",
  canceled: "Payment cancelled",
  declined: "Payment declined",
  already_paid: "Already paid",
  changed: "Not charged",
  not_approved: "Not charged",
  error: "We're still checking",
  invalid: "Link not valid",
};

export default function PayPalOutcome({ mode }: { mode: "return" | "cancel" }) {
  const [answer, setAnswer] = React.useState<Answer | null>(null);
  const started = React.useRef(false);

  React.useEffect(() => {
    if (started.current) return; // React strict mode / re-render: ask once
    started.current = true;
    const url = new URL(window.location.href);
    const row = url.searchParams.get("row");
    const sig = url.searchParams.get("sig");
    const token = url.searchParams.get("token");
    fetch("/api/pay/paypal/return", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ row, sig, token, cancel: mode === "cancel" }),
    })
      .then((r) => r.json())
      .then((a: Answer) => setAnswer(a))
      .catch(() =>
        setAnswer({ outcome: "error", message: "We couldn't confirm the PayPal payment yet. Please don't pay again — check the invoice in a few minutes." })
      );
  }, [mode]);

  const tone =
    answer?.outcome === "paid"
      ? "border-green/30 bg-green/10"
      : answer?.outcome === "pending" || answer?.outcome === "error"
        ? "border-amber-300/30 bg-amber-300/10"
        : answer?.outcome === "already_paid"
          ? "border-sky-300/30 bg-sky-300/10"
          : "border-mist/15 bg-ink-2";
  const titleCls = answer?.outcome === "paid" ? "text-green" : answer?.outcome === "pending" || answer?.outcome === "error" ? "text-amber-300" : "text-mist";
  const invoiceHref = answer?.invoiceNo ? `/dashboard/invoices/${encodeURIComponent(answer.invoiceNo)}` : "/dashboard/invoices";
  const canRetry = answer && ["canceled", "declined", "changed", "not_approved"].includes(answer.outcome) && answer.invoiceNo;

  return (
    <AuthLayout>
      {!answer ? (
        <div className="rounded-lg border border-mist/10 bg-ink-2 p-6 text-center" role="status" aria-live="polite">
          <p className="text-base font-bold text-mist">{mode === "cancel" ? "One moment…" : "Confirming your PayPal payment…"}</p>
          <p className="mt-2 text-sm text-muted">Please keep this page open. Don&rsquo;t pay again.</p>
        </div>
      ) : (
        <div className={`rounded-lg border p-6 ${tone}`} role="status" aria-live="polite">
          <p className={`text-lg font-bold ${titleCls}`}>{TITLE[answer.outcome] ?? "Payment"}</p>
          {answer.invoiceNo && (
            <p className="mt-1 text-sm text-muted">
              Invoice {answer.invoiceNo}
              {answer.fxLine ? ` · ${answer.fxLine}` : ""}
            </p>
          )}
          <p className="mt-3 text-sm text-mist">{answer.message}</p>
          {answer.outcome === "paid" && <p className="mt-2 text-sm text-muted">A receipt is on its way to your email.</p>}
          <div className="mt-5 flex flex-col gap-2">
            {canRetry && (
              <Link href={`${invoiceHref}?pay=1`} className="w-full rounded-lg bg-green px-4 py-3 text-center text-sm font-bold text-ink">
                Try again
              </Link>
            )}
            <Link
              href={invoiceHref}
              className={
                canRetry
                  ? "w-full rounded-lg border border-mist/20 px-4 py-3 text-center text-sm font-semibold text-muted"
                  : "w-full rounded-lg bg-green px-4 py-3 text-center text-sm font-bold text-ink"
              }
            >
              {answer.invoiceNo ? "Back to the invoice" : "Go to my invoices"}
            </Link>
          </div>
        </div>
      )}
    </AuthLayout>
  );
}
