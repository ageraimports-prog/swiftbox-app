import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

/**
 * SP01 Block B — minimal stub proving the session cookie round-trips.
 * Block C replaces this with the authenticated shell (header, logout,
 * middleware protection).
 */
export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-ink px-5 text-center">
      <p className="text-sm text-muted-dark">Signed in as</p>
      <h1 className="sb-disp mt-1 text-3xl text-mist">{session.name}</h1>
      <p className="mt-2 text-sm text-green">Account #{session.ac}</p>
      <p className="mt-8 text-xs text-muted-dark">
        Authenticated shell lands in Block C.
      </p>
    </main>
  );
}
