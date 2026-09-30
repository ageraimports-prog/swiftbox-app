import { referralStageLabel, type ReferralStage } from "@/lib/referral-list";
import type { ReferralListItem } from "@/lib/referral";

/**
 * "Your referrals" — who signed up with this customer's link and how far each
 * has got. First name + last initial only. Presentation only; the list is read
 * server-side (getReferralList).
 */
const DOT: Record<ReferralStage, string> = {
  signed_up: "bg-mist/40",
  on_its_way: "bg-amber-400",
  checking: "bg-amber-400",
  declined: "bg-mist/40",
  earned: "bg-green",
};

export default function ReferralListCard({ items, creditTtd }: { items: ReferralListItem[]; creditTtd: number }) {
  if (items.length === 0) return null;
  return (
    <section className="rounded-lg border border-mist/10 bg-ink-2 p-5">
      <h2 className="sb-disp text-lg text-mist">Your referrals</h2>
      <ul className="mt-3 divide-y divide-mist/10">
        {items.map((it) => (
          <li key={it.id} className="flex items-center justify-between gap-3 py-2.5">
            <span className="text-sm text-mist">{it.name}</span>
            <span className="flex items-center gap-2 text-right text-xs text-muted-dark">
              <span className={`h-2 w-2 flex-none rounded-full ${DOT[it.stage]}`} aria-hidden />
              <span className={it.stage === "earned" ? "font-semibold text-green" : ""}>
                {referralStageLabel(it.stage, creditTtd)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
