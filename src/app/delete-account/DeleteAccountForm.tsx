"use client";

import * as React from "react";
import Link from "next/link";
import AuthLayout from "@/components/AuthLayout";

const inputCls =
  "w-full rounded-md border border-gray-200 bg-white px-4 py-3.5 text-base text-ink placeholder:text-gray-400 focus:outline-none focus:border-green focus:ring-2 focus:ring-green/40";

const labelCls = "mb-1.5 block text-xs font-semibold text-muted";

export default function DeleteAccountForm({
  defaultName,
  defaultEmail,
  defaultAccountNo,
  signedIn,
}: {
  defaultName: string;
  defaultEmail: string;
  defaultAccountNo: string;
  signedIn: boolean;
}) {
  const [name, setName] = React.useState(defaultName);
  const [email, setEmail] = React.useState(defaultEmail);
  const [accountNo, setAccountNo] = React.useState(defaultAccountNo);
  const [reason, setReason] = React.useState("");
  const [confirmed, setConfirmed] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/account/delete-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, accountNo, reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setError(data?.error ?? "Something went wrong. Please try again.");
        setSubmitting(false);
        return;
      }
      setSent(true);
    } catch {
      setError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout>
      <div className="rounded-xl bg-white p-6 shadow-2xl">
        {sent ? (
          <>
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green/15">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-6 w-6 text-green-deep" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
            </div>
            <h1 className="sb-disp mb-1 text-2xl text-ink">Request received</h1>
            <p className="text-sm text-muted">
              We&rsquo;ve sent a confirmation to{" "}
              <span className="font-semibold text-ink">{email}</span>. Your account
              and personal data will be deleted within 30 days, and we&rsquo;ll email
              you when it&rsquo;s done.
            </p>
            <p className="mt-3 text-xs text-muted">
              If you have packages in transit or an unpaid balance, we&rsquo;ll reach
              out to settle those first.
            </p>
          </>
        ) : (
          <>
            <h1 className="sb-disp mb-1 text-2xl text-ink">
              Delete your account
            </h1>
            <p className="mb-5 text-sm text-muted">
              This closes your Swiftbox account and removes the personal data we
              hold for it. You don&rsquo;t need to be signed in to ask.
            </p>

            <div className="mb-5 rounded-md border border-gray-200 bg-gray-50 px-4 py-3.5">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                What gets deleted
              </p>
              <p className="text-xs leading-relaxed text-muted">
                Your profile and login, your Miami and local delivery addresses,
                your pre-alerts and package history, your invoice and payment
                records, and your referral code and credits.
              </p>
              <p className="mt-3 mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                What we have to keep
              </p>
              <p className="text-xs leading-relaxed text-muted">
                Swiftbox is a licensed customs broker. Customs entries filed in
                your name for shipments already cleared must be retained for the
                period Trinidad &amp; Tobago and US customs law requires. Those
                records are kept for compliance only and are not used for
                anything else. Full detail in our{" "}
                <a
                  href="https://swiftboxtt.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-green-deep underline"
                >
                  privacy policy
                </a>
                .
              </p>
            </div>

            <form onSubmit={handleSubmit} noValidate>
              {error && (
                <div role="alert" className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <label className="mb-4 block">
                <span className={labelCls}>Full name</span>
                <input
                  type="text"
                  className={inputCls}
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoComplete="name"
                />
              </label>

              <label className="mb-4 block">
                <span className={labelCls}>Email on the account</span>
                <input
                  type="email"
                  inputMode="email"
                  className={inputCls}
                  placeholder="you@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                />
              </label>

              <label className="mb-4 block">
                <span className={labelCls}>
                  Account number <span className="font-normal">(optional)</span>
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  className={inputCls}
                  placeholder="e.g. 0232"
                  value={accountNo}
                  onChange={(e) => setAccountNo(e.target.value)}
                />
              </label>

              <label className="mb-4 block">
                <span className={labelCls}>
                  Anything we should know? <span className="font-normal">(optional)</span>
                </span>
                <textarea
                  className={`${inputCls} min-h-24 resize-y`}
                  placeholder="Tell us why you're leaving, or anything we should handle first."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>

              <label className="mb-5 flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-0.5 h-5 w-5 shrink-0 accent-green-deep"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                <span className="text-xs leading-relaxed text-muted">
                  I understand this closes my Swiftbox account and deletes my
                  personal data, and that this cannot be undone.
                </span>
              </label>

              <button
                type="submit"
                disabled={submitting || !confirmed}
                className="w-full rounded-xl border border-red-500/50 bg-red-50 px-6 py-3.5 text-sm font-bold text-red-700 transition-colors hover:bg-red-100 disabled:opacity-50"
              >
                {submitting ? "Submitting…" : "Request account deletion"}
              </button>
            </form>

            <p className="mt-5 text-center text-xs text-muted">
              Prefer to talk to someone?{" "}
              <a
                href="https://wa.me/18687033600"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-green-deep underline"
              >
                WhatsApp us
              </a>
              .
            </p>
          </>
        )}
      </div>

      <p className="mt-6 text-center text-sm">
        <Link
          href={signedIn ? "/dashboard/account" : "/login"}
          className="font-semibold text-muted-dark transition-colors hover:text-mist"
        >
          ← {signedIn ? "Back to my account" : "Back to login"}
        </Link>
      </p>
    </AuthLayout>
  );
}
