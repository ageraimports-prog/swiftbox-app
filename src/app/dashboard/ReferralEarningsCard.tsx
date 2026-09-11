import type { ReferralStats } from "@/lib/referral";

/**
 * Referral earnings panel — Sub-piece D. Read-only sibling to ReferralCard.
 * The running total is the motivational headline; below it, the available vs
 * redeemed money split and the qualified vs pending referral counts.
 *
 * Pure presentation — every figure is read server-side and passed in as props.
 */

/** Money with a leading $, grouping and exactly two decimals, e.g. $1,200.00. */
function money(n: number): string {
  return `$${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function ReferralEarningsCard({ stats }: { stats: ReferralStats }) {
  const { totalEarned, available, redeemed, qualifiedCount, pendingCount } = stats;
  const nothingYet = totalEarned === 0;

  return (
    <section className="relative overflow-hidden rounded-lg border border-mist/10 bg-ink-2 p-5">
      <div className="sb-glow absolute -top-16 -right-16 h-48 w-48" aria-hidden />

      <p className="text-xs font-semibold uppercase tracking-widest text-muted-dark">
        Your referral credit
      </p>

      {/* Headline — the money made from referring. */}
      <p className="sb-disp mt-2 text-5xl tracking-tight text-green">
        {money(totalEarned)}
      </p>
      <p className="mt-1 text-xs text-muted-dark">
        {nothingYet
          ? "Credit appears here once a package for someone you referred is delivered."
          : "Credit earned from referrals, all-time."}
      </p>
      <p className="mt-1 text-xs text-muted-dark">
        Credit is applied to your next Swiftbox invoice. It can’t be exchanged
        for cash or transferred.
      </p>

      {/* Money split: available vs redeemed. */}
      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-md border border-mist/10 bg-ink/40 px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-dark">
            Available
          </p>
          <p className="sb-disp mt-1 text-xl text-mist">{money(available)}</p>
        </div>
        <div className="rounded-md border border-mist/10 bg-ink/40 px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-dark">
            Applied to invoices
          </p>
          <p className="sb-disp mt-1 text-xl text-mist">{money(redeemed)}</p>
        </div>
      </div>

      {/* Referral counts: qualified vs pending. */}
      <div className="mt-3 flex items-center gap-5 text-sm text-mist">
        <span>
          <span className="sb-disp text-green">{qualifiedCount}</span>{" "}
          <span className="text-muted-dark">qualified</span>
        </span>
        <span>
          <span className="sb-disp text-mist">{pendingCount}</span>{" "}
          <span className="text-muted-dark">pending</span>
        </span>
      </div>
    </section>
  );
}
