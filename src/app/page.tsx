import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

/** PWA start_url — route to the right place based on session. */
export default async function Home() {
  const session = await getSession();
  redirect(session ? "/dashboard" : "/login");
}
