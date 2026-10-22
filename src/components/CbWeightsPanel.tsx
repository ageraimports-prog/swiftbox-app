import * as React from "react";
import { cbGroupInsuranceLabel, cbSavingLine, formatExactLb } from "@/lib/consolidatedBilling";

/**
 * The Consolidated Bill's combined-weight panel ("Billed weight (rounded up
 * once) … Saved with Consolidated Billing …"), built from WHATEVER the admin's
 * bill-weights route sent. The admin trims that response (2026-10-21), so only
 * billedLb is certain: every other figure is checked before it is shown, a
 * missing one drops its own row, and nothing missing can crash the bill page.
 * The panel is hidden only when there is no billed weight (or the group is not
 * priced yet — ready false).
 */

export type CbWeightsPanelRow = { label: string; value: string; strong?: boolean };
export type CbWeightsPanelView = {
  heading: string;
  rows: CbWeightsPanelRow[];
  coverNote: string | null;
  saved: string | null;
};

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function cbWeightsPanelView(w: unknown): CbWeightsPanelView | null {
  if (!w || typeof w !== "object") return null;
  const o = w as Record<string, unknown>;
  const billed = num(o.billedLb);
  if (!o.ready || billed == null || billed <= 0) return null;

  const rows: CbWeightsPanelRow[] = [];
  const exact = num(o.exactTotalLb);
  if (exact != null && exact > 0) {
    rows.push({ label: o.allExact === false ? "Combined weight" : "Combined exact weight", value: formatExactLb(exact) });
  }
  rows.push({ label: "Billed weight (rounded up once)", value: `${billed} lb`, strong: true });
  const savingLb = num(o.savingLb) ?? 0;
  const separate = num(o.separateLb);
  if (savingLb > 0 && separate != null) rows.push({ label: "Billed separately (each package rounded up)", value: `${separate} lb` });

  const ins = o.insurance && typeof o.insurance === "object" ? (o.insurance as Record<string, unknown>) : null;
  const charged = num(ins?.chargedUsd);
  const combined = num(ins?.combinedValueUsd);
  const insSaving = num(ins?.savingUsd) ?? 0;
  const insSeparate = num(ins?.separateUsd);
  if (charged != null) {
    rows.push({ label: combined != null ? cbGroupInsuranceLabel(combined) : "Insurance (group)", value: `US$${charged.toFixed(2)}`, strong: true });
    if (insSaving > 0 && insSeparate != null) rows.push({ label: "Insurance billed separately (per package)", value: `US$${insSeparate.toFixed(2)}` });
  }
  const cap = num(ins?.coverCapUsd);
  const tvWrs = Array.isArray(ins?.tvWrs) ? (ins!.tvWrs as unknown[]).filter((x): x is string => typeof x === "string") : [];
  const coverNote =
    charged != null && cap != null
      ? `Each package is still covered on its own, up to US$${cap.toFixed(0)}.${tvWrs.length > 0 ? ` TVs are insured on their own (${tvWrs.join(", ")}).` : ""}`
      : null;

  const savingUsd = num(o.savingUsd);
  const savingTtd = num(o.savingTtd);
  const saved = savingUsd != null && savingTtd != null ? cbSavingLine(savingLb, savingUsd, savingTtd, insSaving) : null;

  return { heading: charged != null ? "Weight and insurance" : "Weight", rows, coverNote, saved };
}

export function CbWeightsPanel({ weights }: { weights: unknown }) {
  const v = cbWeightsPanelView(weights);
  if (!v) return null;
  return (
    <section className="rounded-lg border border-mist/10 bg-ink-2 p-5 text-sm" data-cb-weights-panel="">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-dark">{v.heading}</p>
      <div className="mt-2">
        {v.rows.map((r) => (
          <div key={r.label} className={`flex justify-between py-1 ${r.strong ? "font-bold text-mist" : "text-mist"}`}>
            <span>{r.label}</span>
            <span>{r.value}</span>
          </div>
        ))}
      </div>
      {v.coverNote && <p className="mt-2 text-xs text-muted-dark">{v.coverNote}</p>}
      {v.saved && <p className="mt-3 rounded-md bg-green/10 px-3 py-2 text-sm font-bold text-green">{v.saved}</p>}
    </section>
  );
}
