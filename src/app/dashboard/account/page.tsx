import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import ShippingAddress from "./ShippingAddress";

export default async function AccountPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div className="flex flex-col gap-6">
      {/* Account identity */}
      <section className="rounded-lg border border-mist/10 bg-ink-2 p-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-dark">
          Account
        </p>
        <p className="sb-disp mt-2 text-2xl text-mist">{session.name}</p>
        <p className="mt-1 text-sm text-green">Account #{session.ac}</p>
        <p className="mt-0.5 text-xs text-muted-dark">{session.email}</p>
      </section>

      {/* Shipping address (AIR / SEA, copy-to-clipboard) */}
      <ShippingAddress accountNo={session.ac} customerName={session.name} />

      {/* Support */}
      <section>
        <h2 className="sb-disp mb-3 text-lg text-mist">Need help?</h2>
        <div className="grid grid-cols-2 gap-3">
          <a
            href="https://wa.me/18687953300"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-lg bg-green px-4 py-3 text-sm font-bold text-ink transition-colors hover:bg-green-deep"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5" aria-hidden>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 0 1-.825-.242m9.345-8.334a2.126 2.126 0 0 0-.476-.095 48.64 48.64 0 0 0-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0 0 11.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155"
              />
            </svg>
            WhatsApp Support
          </a>
          <a
            href="tel:18687953300"
            className="flex items-center justify-center gap-2 rounded-lg border border-green/40 bg-ink px-4 py-3 text-sm font-bold text-green transition-colors hover:border-green hover:bg-green/5"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5" aria-hidden>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z"
              />
            </svg>
            Call Us
          </a>
        </div>
      </section>

      {/* Sign out */}
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
