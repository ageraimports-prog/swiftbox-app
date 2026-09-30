/**
 * "Your referrals" — the pure half: how a referred friend is named and which
 * stage they are at. No DB (the query is getReferralList in referral.ts).
 * Tested in referral-list.test.ts.
 *
 * Stages (REFERRAL_FLOW_RESEARCH.md §4.6):
 *   signed_up   the friend confirmed their email (a referrals row exists)
 *   on_its_way  the friend has at least one package with us
 *   earned      their first package was delivered and the TT$100 was paid
 * plus two honest states the office creates (SwiftboxAdmin /admin/referrals):
 *   checking    delivered, but the credit is held for the owner's review
 *   declined    delivered, and the owner decided no credit is due
 */
export type ReferralStage = "signed_up" | "on_its_way" | "checking" | "declined" | "earned";

export type ReferralFacts = {
  packages: number;
  delivered: number;
  qualified: boolean;
  paid: boolean;
  decision: string | null;
};

export function referralStage(f: ReferralFacts): ReferralStage {
  if (f.paid) return "earned";
  if (f.qualified || f.delivered > 0) return f.decision === "rejected" ? "declined" : "checking";
  if (f.packages > 0) return "on_its_way";
  return "signed_up";
}

export function referralStageLabel(stage: ReferralStage, creditTtd: number): string {
  switch (stage) {
    case "earned":
      return `Delivered — TT$${creditTtd} earned`;
    case "checking":
      return "Delivered — credit being checked";
    case "declined":
      return "Delivered — not eligible for credit";
    case "on_its_way":
      return "First package on its way";
    default:
      return "Signed up";
  }
}

function cleanWord(s: unknown): string {
  if (typeof s !== "string") return "";
  const w = s.trim().split(/\s+/)[0] ?? "";
  if (w.includes("@")) return "";
  return w.replace(/[^\p{L}'’-]/gu, "");
}

/**
 * First name and last initial only ("Kezia B."), never the full surname. Some
 * legacy rows hold the whole name in fname, so the initial falls back to the
 * second word of fname when lname is empty.
 */
export function friendDisplayName(fname: unknown, lname: unknown): string {
  const first = cleanWord(fname);
  const surname = cleanWord(lname) || cleanWord(typeof fname === "string" ? fname.trim().split(/\s+/)[1] : "");
  const cap = (w: string) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : "");
  if (!first) return "A friend";
  return surname ? `${cap(first)} ${surname[0].toUpperCase()}.` : cap(first);
}
