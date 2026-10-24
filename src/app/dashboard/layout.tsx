import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { query } from "@/lib/db";
import TabBar from "@/components/TabBar";
import { getSession } from "@/lib/session";
import { unreadFlagCount } from "@/lib/prealert-flags";
import { countPackagesNeedingPrealert } from "@/lib/prealert-pick-server";

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getSession();
  if (!session) redirect("/login"); // middleware backstop

  const firstName = session.name.split(" ")[0] || "there";

  // Badge on the Pre-alert tab. Secondary — a bridge hiccup hides the badge,
  // never the page.
  let prealertCount = 0;
  try {
    prealertCount = await countPackagesNeedingPrealert(session.id);
  } catch {
    prealertCount = 0;
  }
  let unreadNotices = 0;
  try {
    const rows = await query<{ n: number }>(`SELECT COUNT(*) AS n FROM swiftbox_package_status_notices n JOIN mod_packages p ON p.pk_id=n.pk_id WHERE p.user_id=:userId AND n.kind='received_app' AND n.status='unread'`, { userId: session.id });
    unreadNotices = Number(rows[0]?.n ?? 0);
  } catch {
    // A bridge interruption must not hide the customer's packages.
  }
  // Pre-alert flags ("we've flagged … to the Miami warehouse") count as notices too; never fatal.
  unreadNotices += await unreadFlagCount(session.id);

  return (
    <div className="min-h-screen bg-ink">
      <header className="sticky top-0 z-20 border-b border-mist/10 bg-ink/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex max-w-md items-center justify-between px-5 py-3.5">
          <Image
            src="/logos/swiftbox-logo-on-dark.png"
            alt="Swiftbox"
            width={656}
            height={142}
            priority
            className="h-6 w-auto"
          />
          <div className="flex items-center gap-3"><Link href="/dashboard/notices" className="text-sm font-semibold text-mist" aria-label={`Notices${unreadNotices ? `, ${unreadNotices} unread` : ''}`}>
            Notices {unreadNotices > 0 && <span className="rounded-full bg-green px-2 py-0.5 text-ink">{unreadNotices}</span>}
          </Link><p className="text-sm font-semibold text-mist">Hi <span className="text-green">{firstName}</span></p></div>
        </div>
      </header>

      {/* --sb-reminder-h: room for the "add to home screen" bar while it shows */}
      <main className="mx-auto max-w-md px-5 pt-6 pb-[calc(7rem+var(--sb-reminder-h,0px))]">{children}</main>

      <TabBar prealertCount={prealertCount} />
    </div>
  );
}
