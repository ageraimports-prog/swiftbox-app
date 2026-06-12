import { redirect } from "next/navigation";
import { query } from "@/lib/db";
import { getSession } from "@/lib/session";

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

      {/* SP02 home */}
      <section className="flex flex-col items-center rounded-lg border border-dashed border-mist/15 px-6 py-12 text-center">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          className="h-10 w-10 text-muted-dark"
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m21 7.5-9-5.25L3 7.5m18 0-9 5.25M3 7.5l9 5.25m9-5.25v9l-9 5.25m0-9v9m-9-14.25v9l9 5.25"
          />
        </svg>
        <p className="mt-4 text-sm font-semibold text-mist">
          Your packages will appear here
        </p>
        <p className="mt-1 text-xs text-muted-dark">
          Package tracking is on the way in the next update.
        </p>
      </section>
    </div>
  );
}
