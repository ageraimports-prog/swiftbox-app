"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthLayout from "@/components/AuthLayout";

const inputCls =
  "w-full rounded-md border border-gray-200 bg-white px-4 py-3.5 pr-12 text-base text-ink placeholder:text-gray-400 focus:outline-none focus:border-green focus:ring-2 focus:ring-green/40";

function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
}) {
  const [show, setShow] = React.useState(false);
  return (
    <label className="mb-4 block">
      <span className="mb-1.5 block text-xs font-semibold text-muted">{label}</span>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          className={inputCls}
          placeholder="••••••••"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          required
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Hide password" : "Show password"}
          className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-muted hover:text-ink"
        >
          {show ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className="h-5 w-5" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className="h-5 w-5" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            </svg>
          )}
        </button>
      </div>
    </label>
  );
}

export default function ResetPasswordPage() {
  const router = useRouter();
  const [token, setToken] = React.useState<string | null>(null);
  const [checked, setChecked] = React.useState(false);

  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [expired, setExpired] = React.useState(false);

  React.useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("token");
    if (!t) {
      router.replace("/forgot-password");
      return;
    }
    setToken(t);
    setChecked(true);
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        if (res.status === 400 && data?.error === "Invalid or expired link") {
          setExpired(true);
          return;
        }
        setError(data?.error ?? "Something went wrong. Please try again.");
        setSubmitting(false);
        return;
      }
      router.push("/login?reset=1");
    } catch {
      setError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  // Brief blank while we read the token (redirect happens if missing).
  if (!checked) {
    return (
      <AuthLayout>
        <div className="flex justify-center py-10">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-green border-t-transparent" />
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="rounded-xl bg-white p-6 shadow-2xl">
        {expired ? (
          <>
            <h1 className="sb-disp mb-1 text-2xl text-ink">Link expired</h1>
            <p className="mb-6 text-sm text-muted">
              This reset link is invalid or has expired. Request a new one to
              continue.
            </p>
            <Link
              href="/forgot-password"
              className="flex w-full items-center justify-center rounded-xl bg-green px-6 py-3.5 text-sm font-bold text-ink transition-colors hover:bg-green-deep"
            >
              Request a new link
            </Link>
          </>
        ) : (
          <>
            <h1 className="sb-disp mb-1 text-2xl text-ink">Set a new password</h1>
            <p className="mb-6 text-sm text-muted">
              Choose a new password for your Swiftbox account.
            </p>

            <form onSubmit={handleSubmit} noValidate>
              {error && (
                <div role="alert" className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <PasswordField
                label="New password"
                value={password}
                onChange={setPassword}
                autoComplete="new-password"
              />
              <PasswordField
                label="Confirm password"
                value={confirm}
                onChange={setConfirm}
                autoComplete="new-password"
              />

              <p className="mb-6 mt-1 text-xs text-muted">At least 8 characters.</p>

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-xl bg-green px-6 py-3.5 text-sm font-bold text-ink transition-colors hover:bg-green-deep disabled:opacity-60"
              >
                {submitting ? "Updating…" : "Update password"}
              </button>
            </form>
          </>
        )}
      </div>
    </AuthLayout>
  );
}
