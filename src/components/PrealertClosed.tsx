import { CLOSED_MESSAGE, WHATSAPP_URL } from "@/lib/prealert-pick";

/** The one answer for a package that is closed, not the customer's, or doesn't exist. */
export default function PrealertClosed() {
  return (
    <section className="rounded-lg border border-mist/10 bg-ink-2 p-5">
      <p className="sb-disp text-lg text-mist">Can&apos;t pre-alert this package</p>
      <p className="mt-2 text-sm leading-relaxed text-muted-dark">{CLOSED_MESSAGE}</p>
      <a
        href={WHATSAPP_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 inline-flex rounded-lg border border-green/40 bg-ink px-4 py-3 text-sm font-bold text-green transition-colors hover:border-green hover:bg-green/5"
      >
        WhatsApp (868) 703-3600
      </a>
    </section>
  );
}
