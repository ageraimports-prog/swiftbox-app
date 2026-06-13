import { redirect } from "next/navigation";
import { query } from "@/lib/db";
import { getSession } from "@/lib/session";
import DashboardHome from "./DashboardHome";

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

  return (
    <div className="flex flex-col gap-6">
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

      <DashboardHome />
    </div>
  );
}
