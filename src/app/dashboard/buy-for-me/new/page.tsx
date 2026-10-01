"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MAX_ITEMS_PER_REQUEST } from "@/lib/buy-for-me-core";
import { BuyForMeRules, card, ghostButton, greenButton } from "../ui";

type Item = { productUrl: string; qty: string; variant: string; priceSeen: string; note: string };
const blank = (): Item => ({ productUrl: "", qty: "1", variant: "", priceSeen: "", note: "" });

const input =
  "w-full rounded-md border border-mist/15 bg-ink px-3 py-2.5 text-sm text-mist placeholder:text-muted-dark outline-none focus:border-green";
const label = "mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-dark";

export default function NewBuyForMePage() {
  const router = useRouter();
  const [items, setItems] = React.useState<Item[]>([blank()]);
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [itemErrors, setItemErrors] = React.useState<Record<number, string>>({});
  const [feePct, setFeePct] = React.useState<number | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/buy-for-me/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => !cancelled && d && typeof d.feePct === "number" && setFeePct(d.feePct))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const set = (i: number, k: keyof Item, v: string) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, [k]: v } : x)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setItemErrors({});
    try {
      const res = await fetch("/api/buy-for-me", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, note }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        setItemErrors(data.itemErrors ?? {});
        return;
      }
      router.push(`/dashboard/buy-for-me/${data.id}`);
      router.refresh();
    } catch {
      setError("Couldn't send your request. Please check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div>
        <Link href="/dashboard/buy-for-me" className="text-xs text-muted-dark hover:text-mist">
          ← Buy For Me
        </Link>
        <h1 className="sb-disp mt-1 text-xl text-mist">New request</h1>
      </div>

      <section className={card}>
        <p className="mb-2 text-sm font-semibold text-mist">How Buy For Me works</p>
        <BuyForMeRules feePct={feePct} />
      </section>

      {items.map((it, i) => (
        <section key={i} className={`${card} ${itemErrors[i] ? "border-red-400/50" : ""}`}>
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-mist">Item {i + 1}</p>
            {items.length > 1 && (
              <button type="button" className="text-xs text-red-300 underline" onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}>
                Remove
              </button>
            )}
          </div>
          <div className="mt-3 flex flex-col gap-3">
            <label>
              <span className={label}>Product link *</span>
              <input className={input} type="url" inputMode="url" required placeholder="https://www.amazon.com/…" value={it.productUrl} onChange={(e) => set(i, "productUrl", e.target.value)} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label>
                <span className={label}>Quantity</span>
                <input className={input} inputMode="numeric" value={it.qty} onChange={(e) => set(i, "qty", e.target.value)} />
              </label>
              <label>
                <span className={label}>Price you saw (USD)</span>
                <input className={input} inputMode="decimal" placeholder="optional" value={it.priceSeen} onChange={(e) => set(i, "priceSeen", e.target.value)} />
              </label>
            </div>
            <label>
              <span className={label}>Size / colour / variant</span>
              <input className={input} placeholder="e.g. Size 10, white" value={it.variant} onChange={(e) => set(i, "variant", e.target.value)} />
            </label>
            <label>
              <span className={label}>Notes</span>
              <input className={input} placeholder="optional" value={it.note} onChange={(e) => set(i, "note", e.target.value)} />
            </label>
            {itemErrors[i] && <p className="text-xs text-red-300">{itemErrors[i]}</p>}
          </div>
        </section>
      ))}

      {items.length < MAX_ITEMS_PER_REQUEST && (
        <button type="button" className={ghostButton} onClick={() => setItems((xs) => [...xs, blank()])}>
          + Add another item
        </button>
      )}

      <label className={card}>
        <span className={label}>Anything else we should know?</span>
        <textarea className={`${input} min-h-20`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional" />
      </label>

      {error && (
        <div role="alert" className="rounded-md bg-red-400/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <button type="submit" disabled={busy} className={greenButton}>
        {busy ? "Sending…" : "Send request"}
      </button>
      <p className="text-center text-xs text-muted-dark">You don&apos;t pay anything now — we&apos;ll send you a quote first.</p>
    </form>
  );
}
