import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { loadPickState, nextAfter } from "@/lib/prealert-pick-server";
import PrealertClosed from "@/components/PrealertClosed";
import QueryToast from "@/components/QueryToast";
import CopyTracking from "@/components/CopyTracking";
import { displayTitle, trackingNumbers } from "@/lib/packageDisplay";
import PickForm from "./PickForm";

/**
 * Pre-alert a package we already hold — the deep link in the arrival email
 * (https://app.swiftboxtt.com/dashboard/prealert/{pk_id}). The middleware sends a
 * logged-out visitor to /login?next=<this URL> and back here afterwards.
 */
export default async function PickPrealertPage({ params }: { params: Promise<{ packageId: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login"); // middleware backstop

  const { packageId } = await params;
  const pkId = /^\d{1,10}$/.test(packageId) ? Number(packageId) : 0;
  const pick = await loadPickState(session.id, pkId);

  if (pick.state === "prealerted") {
    const { next } = await nextAfter(session.id, pkId);
    redirect(next ? `/dashboard/prealert/${next}?toast=already` : "/dashboard/prealerts?toast=already");
  }

  const tracking = pick.state === "open" ? trackingNumbers(pick.pkg.tracking) : [];

  return (
    <div className="flex flex-col gap-4">
      <QueryToast />
      <Link
        href="/dashboard/prealerts"
        className="flex w-fit items-center gap-1.5 text-sm font-semibold text-muted-dark transition-colors hover:text-mist"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
        </svg>
        Pre-alerts
      </Link>

      <h1 className="sb-disp text-2xl text-mist">Pre-alert your package</h1>

      {pick.state === "closed" ? (
        <PrealertClosed />
      ) : (
        <>
          <section className="rounded-lg border border-mist/10 bg-ink-2 p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-dark">
              At our {pick.pkg.warehouse} warehouse
            </p>
            <p className="sb-disp mt-2 text-xl text-mist">
              {displayTitle(pick.pkg.description) ?? pick.pkg.carrier ?? "Package"}
            </p>
            {tracking.length > 0 && (
              <div className="mt-1.5">
                <CopyTracking numbers={tracking} />
              </div>
            )}
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              {/* `shipper` is the store OR the carrier as the warehouse typed it
                  ("AMAZON"), so it is labelled "From", not "Carrier" — the
                  carrier chip on the tracking number is the detected one. */}
              <dt className="text-muted-dark">From</dt>
              <dd className="font-semibold text-mist">{pick.pkg.carrier ?? "—"}</dd>
              <dt className="text-muted-dark">Weight</dt>
              <dd className="font-semibold text-mist">{pick.pkg.weightLb} lb</dd>
              <dt className="text-muted-dark">Arrived</dt>
              <dd className="font-semibold text-mist">{pick.pkg.arrivedLabel}</dd>
              <dt className="text-muted-dark">Warehouse</dt>
              <dd className="font-semibold text-mist">{pick.pkg.warehouse}</dd>
              {pick.pkg.wr && (
                <>
                  <dt className="text-muted-dark">Swiftbox reference</dt>
                  <dd className="text-muted-dark">{pick.pkg.wr}</dd>
                </>
              )}
            </dl>
            <p className="mt-3 text-xs text-muted-dark">
              We&apos;ve filled these in from the package. Just tell us what&apos;s inside and what it&apos;s worth.
            </p>
          </section>

          <PickForm packageId={pick.pkg.pkId} />
        </>
      )}
    </div>
  );
}
