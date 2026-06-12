"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

const inputCls =
  "w-full rounded-md border border-gray-200 bg-white px-4 py-3.5 text-base text-ink placeholder:text-gray-400 focus:outline-none focus:border-green focus:ring-2 focus:ring-green/40";

export default function LoginPage() {
  const router = useRouter();

  const [identifier, setIdentifier] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Something went wrong. Please try again.");
        setSubmitting(false);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <main className="relative flex min-h-screen flex-col bg-ink px-5 pt-[max(env(safe-area-inset-top),2.5rem)] pb-[max(env(safe-area-inset-bottom),2rem)]">
      <div className="sb-glow absolute inset-x-0 top-0 h-72" aria-hidden />

      <header className="relative flex justify-center pt-2 pb-10">
        <Image
          src="/logos/swiftbox-logo-on-dark.png"
          alt="Swiftbox"
          width={656}
          height={142}
          priority
          className="h-9 w-auto"
        />
      </header>

      <section className="relative mx-auto w-full max-w-md">
        <div className="rounded-xl bg-white p-6 shadow-2xl">
          <h1 className="sb-disp mb-1 text-2xl text-ink">Welcome back</h1>
          <p className="mb-6 text-sm text-muted">
            Sign in to track your packages and manage your Skybox.
          </p>

          <form onSubmit={handleSubmit} noValidate>
            {error && (
              <div
                role="alert"
                className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700"
              >
                {error}
              </div>
            )}

            <label className="mb-4 block">
              <span className="mb-1.5 block text-xs font-semibold text-muted">
                Account number or email
              </span>
              <input
                type="text"
                inputMode="email"
                className={inputCls}
                placeholder="0232 or you@email.com"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
              />
            </label>

            <label className="mb-6 block">
              <span className="mb-1.5 block text-xs font-semibold text-muted">
                Password
              </span>
              <input
                type="password"
                className={inputCls}
                placeholder="Your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </label>

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-green px-6 py-3.5 text-sm font-bold text-ink transition-colors hover:bg-green-deep disabled:opacity-60"
            >
              {submitting ? "Signing in…" : "Sign in →"}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-muted-dark">
          Your account number is on your Swiftbox membership card.
        </p>
      </section>
    </main>
  );
}
