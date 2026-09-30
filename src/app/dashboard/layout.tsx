import Image from "next/image";
import { redirect } from "next/navigation";
import TabBar from "@/components/TabBar";
import { getSession } from "@/lib/session";

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getSession();
  if (!session) redirect("/login"); // middleware backstop

  const firstName = session.name.split(" ")[0] || "there";

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
          <p className="text-sm font-semibold text-mist">
            Hi <span className="text-green">{firstName}</span>
          </p>
        </div>
      </header>

      {/* --sb-reminder-h: room for the "add to home screen" bar while it shows */}
      <main className="mx-auto max-w-md px-5 pt-6 pb-[calc(7rem+var(--sb-reminder-h,0px))]">{children}</main>

      <TabBar />
    </div>
  );
}
