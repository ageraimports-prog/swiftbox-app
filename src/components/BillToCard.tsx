import { billToTextLines, type BillToView } from "@/lib/invoice-bill-to-core";

/** The "Bill to" card on an invoice or bill. Nothing to show → no card. */
export function BillToCard({ billTo }: { billTo?: BillToView | null }) {
  if (!billTo) return null;
  const lines = billToTextLines(billTo);
  if (!billTo.name && !lines.length) return null;
  return (
    <section className="rounded-lg border border-mist/10 bg-ink-2 p-5">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-dark">Bill to</h2>
      {billTo.name && <p className="text-sm font-semibold text-mist">{billTo.name}</p>}
      {lines.map((line, i) => (
        <p key={i} className="text-sm text-mist/70">
          {line}
        </p>
      ))}
    </section>
  );
}
