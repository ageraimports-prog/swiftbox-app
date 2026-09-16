"use client";

import * as React from "react";
import Link from "next/link";
import AuthLayout from "@/components/AuthLayout";

const inputCls =
  "w-full rounded-md border border-gray-200 bg-white px-4 py-3.5 text-base text-ink placeholder:text-gray-400 focus:outline-none focus:border-green focus:ring-2 focus:ring-green/40";

/** Deliberately loose — the server is the authority. This only stops obvious typos. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordPage() {
  const [email, setEmail] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  /**
   * The address the server accepted. Non-empty is what unlocks the confirmation
   * screen, so "a reset link has been sent to <nothing>" can never render again.
   */
  const [sentTo, setSentTo] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    /**
     * Read the address out of the DOM, not just React state. Android Chrome
     * autofill can fill the box without firing onChange, which used to submit
     * an empty string while the customer was looking at a filled-in field.
     */
    const form = e.currentTarget;
    const fromDom = String(new FormData(form).get("email") ?? "");
    const address = (fromDom || email).trim();

    if (address !== email) setEmail(address);

    setError(null);

    if (!address) {
      setError("Enter your email address.");
      return;
    }
    if (!EMAIL_RE.test(address)) {
      setError("That doesn’t look like a valid email address.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: address }),
      });
      if (!res.ok) {
        let message = "Something went wrong. Please try again.";
        try {
          const data = await res.json();
          if (data?.error) message = String(data.error);
        } catch {
          /* keep the generic message */
        }
        setError(message);
        setSubmitting(false);
        return;
      }
      setSentTo(address);
    } catch {
      setError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout>
      <div className="rounded-xl bg-white p-6 shadow-2xl">
        {sentTo ? (
          <>
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green/15">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-6 w-6 text-green-ink" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
              </svg>
            </div>
            <h1 className="sb-disp mb-1 text-2xl text-ink">Check your email</h1>
            <p className="text-sm text-muted">
              A reset link has been sent to{" "}
              <span className="font-semibold text-ink">{sentTo}</span>. The link
              expires in 1 hour.
            </p>
            <p className="mt-3 text-xs text-muted">
              Didn&rsquo;t get it? Check your spam folder. If nothing arrives,
              the address may not be the one on your Swiftbox account — contact
              us on WhatsApp and we&rsquo;ll check it for you.
            </p>
          </>
        ) : (
          <>
            <h1 className="sb-disp mb-1 text-2xl text-ink">Reset your password</h1>
            <p className="mb-6 text-sm text-muted">
              Enter your email and we&rsquo;ll send you a reset link.
            </p>

            <form onSubmit={handleSubmit}>
              {error && (
                <div role="alert" className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <label className="mb-6 block">
                <span className="mb-1.5 block text-xs font-semibold text-muted">
                  Email address
                </span>
                <input
                  type="email"
                  name="email"
                  inputMode="email"
                  className={inputCls}
                  placeholder="you@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  aria-invalid={error ? true : undefined}
                />
              </label>

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-xl bg-green px-6 py-3.5 text-sm font-bold text-ink transition-colors hover:bg-green-deep disabled:opacity-60"
              >
                {submitting ? "Sending…" : "Send reset link"}
              </button>
            </form>
          </>
        )}
      </div>

      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="font-semibold text-muted-dark transition-colors hover:text-mist">
          ← Back to login
        </Link>
      </p>
    </AuthLayout>
  );
}
