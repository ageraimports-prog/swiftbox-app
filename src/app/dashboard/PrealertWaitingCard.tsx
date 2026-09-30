import Link from "next/link";
import { packagesPhrase } from "@/lib/prealert-pick";

/** Top of the dashboard while packages we hold in Miami still need a pre-alert. */
export default function PrealertWaitingCard({ count }: { count: number }) {
  return (
    <section className="relative overflow-hidden rounded-lg border border-green/40 bg-ink-2 p-5">
      <div className="sb-glow absolute -top-16 -right-16 h-40 w-40" aria-hidden />
      <p className="relative text-xs font-semibold uppercase tracking-widest text-green">
        Waiting for your pre-alert
      </p>
      <p className="relative mt-2 text-sm leading-relaxed text-mist">
        {packagesPhrase(count)} arrived at our Miami warehouse. Pre-alert {count === 1 ? "it" : "them"} so
        customs clears {count === 1 ? "it" : "them"} fast.
      </p>
      <Link
        href="/dashboard/prealerts"
        className="relative mt-4 inline-flex rounded-lg bg-green px-4 py-3 text-sm font-bold text-ink transition-colors hover:bg-green-deep"
      >
        Pre-alert now
      </Link>
    </section>
  );
}
