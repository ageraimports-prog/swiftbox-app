"use client";

import * as React from "react";
import { ADDRESS_LABELS, type ContactDetails } from "@/lib/contact-details-core";

const input =
  "w-full rounded-md border border-mist/15 bg-ink px-3 py-2.5 text-sm text-mist placeholder:text-muted-dark outline-none focus:border-green";
const label = "mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-dark";

type Form = Omit<ContactDetails, "otherPhones" | "altAddressReady">;

/**
 * Delivery details: primary + optional alternate address (Home/Work/Other) and
 * primary + optional alternate phone. Saved through /api/account/contact.
 */
export default function ContactDetailsCard() {
  const [details, setDetails] = React.useState<ContactDetails | null>(null);
  const [form, setForm] = React.useState<Form | null>(null);
  const [editing, setEditing] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [note, setNote] = React.useState<string | null>(null);

  const load = React.useCallback((d: ContactDetails) => {
    setDetails(d);
    const { otherPhones: _o, altAddressReady: _r, ...f } = d;
    void _o;
    void _r;
    setForm(f);
  }, []);

  React.useEffect(() => {
    fetch("/api/account/contact")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then(load)
      .catch(() => setError("Couldn't load your delivery details."));
  }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const r = await fetch("/api/account/contact", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(j.error || "Couldn't save. Please try again.");
        return;
      }
      load(j as ContactDetails);
      setEditing(false);
      setNote("Saved.");
    } finally {
      setBusy(false);
    }
  }

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => (f ? { ...f, [k]: e.target.value } : f));

  const titled = (base: string, l: string) => (l ? `${base} · ${l}` : base);
  const line = (a: string, c: string) => [a, c].filter(Boolean).join(", ");

  return (
    <section className="rounded-lg border border-mist/10 bg-ink-2 p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-dark">Delivery details</p>
        {details && !editing && (
          <button type="button" onClick={() => { setEditing(true); setNote(null); }} className="text-sm font-semibold text-green">
            Edit
          </button>
        )}
      </div>

      {!details && !error && <p className="mt-3 text-sm text-muted-dark">Loading…</p>}
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      {note && !editing && <p className="mt-3 text-sm text-green">{note}</p>}

      {details && !editing && (
        <dl className="mt-3 space-y-3 text-sm">
          <div>
            <dt className="text-xs text-muted-dark">{titled("Main delivery address", details.addressLabel)}</dt>
            <dd className="text-mist">{line(details.address, details.city) || "—"}</dd>
          </div>
          {details.altAddressReady && (
            <div>
              <dt className="text-xs text-muted-dark">{titled("Second address", details.altAddressLabel)}</dt>
              <dd className="text-mist">{line(details.altAddress, details.altCity) || "None (optional)"}</dd>
            </div>
          )}
          <div>
            <dt className="text-xs text-muted-dark">Main phone</dt>
            <dd className="text-mist">{details.phone || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-dark">Second phone</dt>
            <dd className="text-mist">
              {details.altPhone || "None (optional)"}
              {details.otherPhones.length > 0 && (
                <span className="text-muted-dark"> · also {details.otherPhones.join(", ")}</span>
              )}
            </dd>
          </div>
          <p className="text-xs text-muted-dark">
            We deliver to your main address. Our driver can see both addresses and call either number.
          </p>
        </dl>
      )}

      {details && editing && form && (
        <form onSubmit={save} className="mt-4 space-y-4">
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-mist">Main delivery address</legend>
            <div>
              <label className={label} htmlFor="cd-address">Street address</label>
              <input id="cd-address" className={input} maxLength={100} value={form.address} onChange={set("address")} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label} htmlFor="cd-city">Town</label>
                <input id="cd-city" className={input} maxLength={50} value={form.city} onChange={set("city")} required />
              </div>
              {details.altAddressReady && (
                <div>
                  <label className={label} htmlFor="cd-label">Label</label>
                  <LabelSelect id="cd-label" value={form.addressLabel} onChange={set("addressLabel")} />
                </div>
              )}
            </div>
          </fieldset>

          {details.altAddressReady && (
            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold text-mist">
                Second address <span className="font-normal text-muted-dark">(optional — e.g. work)</span>
              </legend>
              <div>
                <label className={label} htmlFor="cd-alt-address">Street address</label>
                <input id="cd-alt-address" className={input} maxLength={100} value={form.altAddress} onChange={set("altAddress")} placeholder="Leave empty if you don't need one" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={label} htmlFor="cd-alt-city">Town</label>
                  <input id="cd-alt-city" className={input} maxLength={50} value={form.altCity} onChange={set("altCity")} />
                </div>
                <div>
                  <label className={label} htmlFor="cd-alt-label">Label</label>
                  <LabelSelect id="cd-alt-label" value={form.altAddressLabel} onChange={set("altAddressLabel")} />
                </div>
              </div>
            </fieldset>
          )}

          <fieldset className="grid grid-cols-2 gap-3">
            <legend className="mb-2 text-sm font-semibold text-mist">Phone numbers</legend>
            <div>
              <label className={label} htmlFor="cd-phone">Main phone</label>
              <input id="cd-phone" className={input} type="tel" inputMode="tel" maxLength={30} value={form.phone} onChange={set("phone")} required />
            </div>
            <div>
              <label className={label} htmlFor="cd-alt-phone">Second phone (optional)</label>
              <input id="cd-alt-phone" className={input} type="tel" inputMode="tel" maxLength={30} value={form.altPhone} onChange={set("altPhone")} placeholder="868-…" />
            </div>
          </fieldset>

          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex gap-3">
            <button type="submit" disabled={busy} className="flex-1 rounded-lg bg-green px-4 py-3 text-sm font-bold text-ink transition-colors hover:bg-green-deep disabled:opacity-60">
              {busy ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => { setEditing(false); setError(null); load(details); }}
              className="rounded-lg border border-mist/15 px-4 py-3 text-sm font-semibold text-mist"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function LabelSelect({ id, value, onChange }: { id: string; value: string; onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void }) {
  return (
    <select id={id} className={input} value={value} onChange={onChange}>
      <option value="">No label</option>
      {ADDRESS_LABELS.map((l) => (
        <option key={l} value={l}>{l}</option>
      ))}
    </select>
  );
}
