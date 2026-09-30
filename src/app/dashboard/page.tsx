import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { query } from "@/lib/db";
import { getSession } from "@/lib/session";
import {
  ensureReferralCode,
  inviteLink,
  shareMessage,
  whatsappShareUrl,
  getReferralStats,
  ZERO_REFERRAL_STATS,
  REFERRAL_CREDIT_TTD,
  REFERRAL_WELCOME_CREDIT_TTD,
  type ReferralStats,
} from "@/lib/referral";
import { countPackagesNeedingPrealert } from "@/lib/prealert-pick-server";
import DashboardHome from "./DashboardHome";
import PrealertWaitingCard from "./PrealertWaitingCard";
import ReferralCard from "./ReferralCard";
import ReferralEarningsCard from "./ReferralEarningsCard";

type UserRow = {
  fname: string;
  lname: string;
  ac: string;
  created: string | null;
};

function memberSince(created: string | null): string | null {
  if (!created) return null;
  const d = new Date(created.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const rows = await query<UserRow>(
    "SELECT fname, lname, ac, created FROM users WHERE id = :id LIMIT 1",
    { id: session.id }
  );
  const user = rows[0];
  if (!user) redirect("/api/logout"); // account vanished — drop the session

  const since = memberSince(user.created);

  // Lazily ensure the customer has a referral code. Secondary to the rest of
  // the dashboard — a bridge hiccup here must not blank the whole page, so on
  // failure we simply skip the card this load.
  let referralCode: string | null = null;
  try {
    referralCode = await ensureReferralCode(session.id);
  } catch {
    referralCode = null;
  }
  // The friend's invite link is the WEBSITE's /r/CODE page (SIGNUP_URL is only a
  // same-site override), never the app — the friend signs up on the marketing site.
  const referralShareUrl = referralCode
    ? whatsappShareUrl(referralCode, process.env.SIGNUP_URL)
    : null;
  const referralLink = referralCode ? inviteLink(referralCode, process.env.SIGNUP_URL) : null;
  const referralMessage = referralCode ? shareMessage(referralCode, process.env.SIGNUP_URL) : null;
  // QR of the invite link, drawn here (no outside service). Optional — on any
  // failure the card simply has no QR button.
  let referralQr: string | null = null;
  if (referralLink) {
    try {
      referralQr = await QRCode.toString(referralLink, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
    } catch {
      referralQr = null;
    }
  }

  // Earnings stats for the panel (Sub-piece D). Secondary to the page like the
  // code-ensure above — a bridge hiccup falls back to zeros, never an error.
  let referralStats: ReferralStats = ZERO_REFERRAL_STATS;
  try {
    referralStats = await getReferralStats(session.id);
  } catch {
    referralStats = ZERO_REFERRAL_STATS;
  }

  // Packages already in Miami waiting for a pre-alert. Secondary, like the two
  // above — on failure the card is simply skipped this load.
  let prealertCount = 0;
  try {
    prealertCount = await countPackagesNeedingPrealert(session.id);
  } catch {
    prealertCount = 0;
  }

  return (
    <div className="flex flex-col gap-6">
      {prealertCount > 0 && <PrealertWaitingCard count={prealertCount} />}

      {/* Account number card */}
      <section className="relative overflow-hidden rounded-lg border border-mist/10 bg-ink-2 p-5">
        <div className="sb-glow absolute -top-16 -right-16 h-48 w-48" aria-hidden />
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-dark">
          Account number
        </p>
        <p className="sb-disp mt-2 text-5xl tracking-tight text-green">
          {user.ac}
        </p>
        <p className="mt-3 text-sm text-mist">
          {user.fname} {user.lname}
        </p>
        {since && (
          <p className="mt-0.5 text-xs text-muted-dark">Member since {since}</p>
        )}
      </section>

      {referralCode && referralShareUrl && referralLink && referralMessage && (
        <ReferralCard
          code={referralCode}
          shareUrl={referralShareUrl}
          inviteLink={referralLink}
          message={referralMessage}
          qrSvg={referralQr}
          creditTtd={REFERRAL_CREDIT_TTD}
          welcomeTtd={REFERRAL_WELCOME_CREDIT_TTD}
        />
      )}

      {referralCode && <ReferralEarningsCard stats={referralStats} />}

      <DashboardHome />
    </div>
  );
}
