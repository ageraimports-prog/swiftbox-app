/**
 * Consolidated Billing — every word the app shows about it, in one place.
 * Client-safe (no server imports): the cards, the switch, the badges and the FAQ
 * all read from here. The rules live in SwiftboxAdmin (CLAUDE.md, R1–R13).
 *
 * COPY RULES (Brent, 27 Sep 2026; freight revised 1 Oct, insurance 2 Oct,
 * R13a 4 Oct 2026). Only these claims: free; we consolidate your packages and
 * deliver them together: one delivery, one bill, with a per-item customs
 * breakdown; the rate per lb is unchanged but the group's freight is charged on
 * its COMBINED EXACT weight, rounded up once (two 0.5 lb packages = 1 lb, not 2);
 * insurance is charged ONCE on the group's combined declared value, and each
 * package is still covered on its own, up to US$500 (never imply one shared cap);
 * duty, OPT and VAT stay per package; the switch is in the Account tab. Never
 * "cheapest", "no hidden fees", typed savings figures in marketing lines,
 * delivery dates or times, competitor names or volume numbers. Wherever US$1.99
 * appears, the 20% fuel is on the same line. The only phone number is
 * (868) 609-3000.
 *
 * R13: nothing the customer sees may say a package is in, or held in,
 * Trinidad. Held packages read CB_WAITING_LABEL.
 *
 * R13a (Brent, 4 Oct 2026): no specifics about WHERE packages are held or wait
 * (no Miami, no warehouse), WHEN they ship or arrive (no "20 days", no "Day N
 * of 20", no window dates, no "as soon as the last one lands"), or HOW the
 * consolidation happens (no repacking / own-box talk). HOLD_DAYS stays for the
 * logic but is never rendered. Locked by consolidatedBilling.test.ts ("R13a").
 */

/**
 * R3 — the window, in days. The admin's HOLD_DAYS is the rule; keep them equal.
 * LOGIC ONLY: never put it in customer text (R13a).
 */
export const HOLD_DAYS = 20;

export const CB_NAME = "Consolidated Billing";

/** Brent's approved sentence (R13a, 4 Oct 2026): the whole promise, nothing more. */
export const CB_TOGETHER_LINE =
  "With Consolidated Billing we consolidate your packages and deliver them together: one delivery, one bill.";

/** One line, for tight spaces. */
export const CB_SHORT_LINE = "Your packages, consolidated and delivered together: one delivery, one bill. Free.";

/** The card when the setting is OFF. */
export const CB_LONG_DESCRIPTION =
  "Ordering from more than one store? With Consolidated Billing we consolidate your packages and deliver them together: one delivery, one bill — its freight charged on the combined weight, rounded up once, and its insurance once on the combined value. Free.";

/**
 * Under the OFF card (2026-10-03): turning it on also takes the packages the
 * customer already has with us. Never says where they are (R13/R13a).
 */
export const CB_EXISTING_INCLUDED = "Packages you've already ordered are included too.";

/** After turning it on, when packages already with us joined the group. */
export function cbEnrolledText(count: number): string {
  return count === 1
    ? "Your package already with us is in your group."
    : `Your ${count} packages already with us are in your group.`;
}

/** Confirm before turning it OFF. */
export const CB_OFF_CONFIRM = "Turning this off sends out what's ready now.";

/** A held package, in place of its status. Never says where it is (R13). */
export const CB_WAITING_LABEL = "Consolidated Billing: waiting for your group";

/**
 * The card while the setting is ON (with or without a group yet). R13a: no day
 * count, no window date, no place. Replaces "Day N of 20 … by <date>".
 */
export const CB_ON_TEXT =
  "Consolidated Billing is on. Free. We consolidate your packages and deliver them together: one delivery, one bill.";

/* ── "Send my packages now" (2026-10-01). A real feature; its text gives no timing or place (R13a). ── */

export const CB_SEND_NOW_BUTTON = "Send my packages now";

/** Under the group's package list, in place of the old "Ships automatically in N days". */
export const CB_SEND_NOW_HINT =
  "Got everything you ordered? Tap Send my packages now and we'll deliver them together.";

/** "3 packages in your group: Shoes, Headphones, Household Items" — what they ARE, never a WR. */
export function cbWaitingSummary(titles: string[]): string {
  const n = titles.length;
  const head = `${n} ${n === 1 ? "package" : "packages"} in your group`;
  return n === 0 ? head : `${head}: ${titles.join(", ")}`;
}

/** The confirmation, before anything happens. */
export function cbSendNowConfirmText(count: number): string {
  const these = count === 1 ? "this package" : `these ${count} packages`;
  return `Send ${these} now? We'll deliver them together, with one bill. Any other packages come separately, or start a new group if Consolidated Billing is still on.`;
}

/** After the tap — and on every waiting package until the group goes out. Never says where (R13). */
export const CB_PREPARING_TEXT = "Your packages are being prepared for delivery.";
/** The short badge on a package card once the customer has said "send them". */
export const CB_PREPARING_LABEL = "Being prepared for delivery";

/** The card once the group has stopped taking packages, before release. No timing (R13a). */
export const CB_CLOSED_CARD = "Your group is complete. We'll deliver your packages together, with one bill.";

/** The in-app notice once a bill is ready (the email is the push). */
export function cbBillReadyText(billNo: string): string {
  return `Your Consolidated Bill ${billNo} is ready.`;
}

export const CB_RATE_LINE = "US$1.99/lb + 20% fuel (US$2.39/lb all-in)";

export const SWIFTBOX_PHONE_DISPLAY = "(868) 609-3000";
export const SWIFTBOX_WHATSAPP = "18686093000";
export const SWIFTBOX_TEL = "tel:+18686093000";

/** "SWIFT-0364" from users.ac (which is dirty: 2 digits, a leading tab…). */
export function swiftCodeFromAc(ac: string | number | null | undefined): string {
  const digits = String(ac ?? "").replace(/\D+/g, "");
  return `SWIFT-${digits.padStart(4, "0")}`;
}

/** WhatsApp, prefilled with the customer's code. */
export function cbWhatsAppUrl(swiftCode: string): string {
  const text = `Hi Swiftbox, I'd like Consolidated Billing. My code is ${swiftCode}`;
  return `https://wa.me/${SWIFTBOX_WHATSAPP}?text=${encodeURIComponent(text)}`;
}

/**
 * Group insurance (2 Oct 2026): one premium on the combined declared value, cover
 * still per package. US$500 is the admin's insurance_cover_cap setting.
 */
export const CB_INSURANCE_LINE =
  "Insurance is charged once on your group's combined declared value, not a minimum on every package, and each package is still covered on its own, up to US$500.";

/** The FAQ. R13a (4 Oct 2026) rewrote it: no place, no timing, no repacking talk.
 *  https://swiftboxtt.com/consolidated-billing and the website's
 *  src/lib/consolidatedBilling.ts still carry the OLD wording (and the 20-day
 *  figure) until the website is changed to match. */
export const CB_FAQ: { q: string; a: string }[] = [
  {
    q: "What is Consolidated Billing?",
    a: `${CB_TOGETHER_LINE} Your group's freight is charged on its combined weight, rounded up once.`,
  },
  { q: "Does Consolidated Billing cost extra?", a: "No. Consolidated Billing is free." },
  {
    q: "What does “Send my packages now” do?",
    a: "Got everything you ordered? Tap “Send my packages now” in the app and we'll deliver them together, with one bill. You can also turn Consolidated Billing off in the Account tab.",
  },
  {
    q: "Does Consolidated Billing lower my freight and insurance?",
    a: `Yes. We weigh every package exactly and charge your group's freight on its combined weight, rounded up once. Two 0.5 lb packages are billed as 1 lb, not 2. The rate stays US$1.99/lb + 20% fuel (US$2.39/lb all-in). ${CB_INSURANCE_LINE} Duty, OPT and VAT stay per package.`,
  },
  {
    q: "What does the bill look like?",
    a: "One bill for the whole delivery. It shows each package's exact weight, your group's combined weight, the group's insurance and what you saved, and each package's customs duty, OPT and VAT broken down item by item.",
  },
  {
    q: "How do I turn on Consolidated Billing?",
    a: "In the Account tab of the Swiftbox app, or WhatsApp or call us on (868) 609-3000.",
  },
  { q: "Can I still follow my packages?", a: "Yes. Every package is in the Swiftbox app." },
  {
    q: "How do I pay?",
    a: "You pay the whole bill at once when your packages are delivered, including in TT$ cash to the driver at your door.",
  },
];

/* ── Combined-weight freight (2026-10-01). The admin computes every figure; these
   only print them, word for word as the bill PDF does (admin lib/cb-weight-core.ts). ── */

/** "0.5 lb" / "1.25 lb" — an exact weight, up to 2 dp, no trailing zeros. */
export function formatExactLb(lb: number): string {
  return `${Number((Math.round(lb * 10000) / 10000).toFixed(2))} lb`;
}

/**
 * "Saved with Consolidated Billing: US$17.57 (TT$119.48) — 4 lb of freight + US$8.00
 * of insurance", or null at 0. savingUsd / savingTtd are the TOTAL (freight + fuel +
 * insurance). Word for word the admin's savingLine (lib/cb-weight-core.ts).
 */
export function cbSavingLine(savingLb: number, savingUsd: number, savingTtd: number, insuranceSavingUsd = 0): string | null {
  if (!(savingUsd > 0)) return null;
  const parts: string[] = [];
  if (savingLb > 0) parts.push(`${savingLb} lb of freight`);
  if (insuranceSavingUsd > 0) parts.push(`US$${insuranceSavingUsd.toFixed(2)} of insurance`);
  return `Saved with Consolidated Billing: US$${savingUsd.toFixed(2)} (TT$${savingTtd.toFixed(2)})${parts.length ? ` — ${parts.join(" + ")}` : ""}`;
}

/** "Insurance (group, combined value US$90.00)" — the admin's groupInsuranceLabel, word for word. */
export function cbGroupInsuranceLabel(combinedValueUsd: number): string {
  return `Insurance (group, combined value US$${combinedValueUsd.toFixed(2)})`;
}
