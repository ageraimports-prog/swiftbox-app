import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export default async function AccountPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-lg border border-mist/10 bg-ink-2 p-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-dark">
          Account
        </p>
        <p className="sb-disp mt-2 text-2xl text-mist">{session.name}</p>
        <p className="mt-1 text-sm text-green">Account #{session.ac}</p>
        <p className="mt-0.5 text-xs text-muted-dark">{session.email}</p>
      </section>

      <section className="rounded-lg border border-dashed border-mist/15 px-6 py-10 text-center">
        <p className="text-sm font-semibold text-mist">Account settings</p>
        <p className="mt-1 text-xs text-muted-dark">
          Profile and notification preferences are coming soon.
        </p>
      </section>

      <form action="/api/logout" method="post">
        <button
          type="submit"
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-400/40 px-6 py-3.5 text-sm font-bold text-red-400 transition-colors hover:bg-red-400/10"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.7}
            className="h-5 w-5"
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-7.5A2.25 2.25 0 0 0 3.75 5.25v13.5A2.25 2.25 0 0 0 6 21h7.5a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9"
            />
          </svg>
          Sign out
        </button>
      </form>
    </div>
  );
}
