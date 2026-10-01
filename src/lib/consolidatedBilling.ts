/**
 * Consolidated Billing — every word the app shows about it, in one place.
 * Client-safe (no server imports): the cards, the switch, the badges and the FAQ
 * all read from here. The rules live in SwiftboxAdmin (CLAUDE.md, R1–R13).
 *
 * COPY RULES (Brent, 27 Sep 2026). Only these claims: free; 20 days from the
 * first Miami arrival; delivered together as soon as the last package lands; one
 * bill with a per-item customs breakdown; rates unchanged per package; no
 * repacking. Never "cheapest", "no hidden fees", delivery dates or times,
 * competitor names or volume numbers. Wherever US$1.99 appears, the 20% fuel is
 * on the same line. The only phone number is (868) 609-3000.
 *
 * R13: nothing the customer sees may say a package is in, or held in,
 * Trinidad. Held packages read CB_WAITING_LABEL.
 */

/** R3 — the window, in days. The admin's HOLD_DAYS is the rule; keep them equal. */
export const HOLD_DAYS = 20;

export const CB_NAME = "Consolidated Billing";

/** One line, for tight spaces. */
export const CB_SHORT_LINE =
  "Everything that reaches Miami within 20 days, one delivery, one bill. Free.";

/** The card when the setting is OFF. */
export const CB_LONG_DESCRIPTION =
  "Ordering from more than one store? Turn on Consolidated Billing and everything that reaches our Miami warehouse within 20 days comes to your door together, with one bill. Free.";

/** Confirm before turning it OFF. */
export const CB_OFF_CONFIRM = "Turning this off sends out what's ready now.";

/** A held package, in place of its status. Never says where it is (R13). */
export const CB_WAITING_LABEL = "Consolidated Billing: waiting for your group";

/** The card while a group is open. `windowEnd` is a date, e.g. "Sat 17 Oct". */
export function cbOpenCardText(day: number, windowEnd: string): string {
  return `Consolidated Billing: Free. Day ${day} of ${HOLD_DAYS}. Packages that reach our Miami warehouse by ${windowEnd} go out together.`;
}

/* ── "Send my packages now" (2026-10-01): 20 days is the MAXIMUM, not the wait. ── */

export const CB_SEND_NOW_BUTTON = "Send my packages now";

/** "3 packages waiting: Shoes, Headphones, Household Items" — what they ARE, never a WR. */
export function cbWaitingSummary(titles: string[]): string {
  const n = titles.length;
  const head = `${n} ${n === 1 ? "package" : "packages"} waiting`;
  return n === 0 ? head : `${head}: ${titles.join(", ")}`;
}

/** "Ships automatically in 15 days". The window is the latest it waits. */
export function cbShipsAutomaticallyText(daysLeft: number): string {
  if (daysLeft <= 1) return "Ships automatically after today";
  return `Ships automatically in ${daysLeft} days`;
}

/** The confirmation, before anything happens. */
export function cbSendNowConfirmText(count: number): string {
  const these = count === 1 ? "this package" : `these ${count} packages`;
  return `Send ${these} now? Anything that arrives after this ships separately, or starts a new group if Consolidated Billing is still on.`;
}

/** After the tap — and on every waiting package until the group goes out. Never says where (R13). */
export const CB_PREPARING_TEXT = "Your packages are being prepared for delivery.";
/** The short badge on a package card once the customer has said "send them". */
export const CB_PREPARING_LABEL = "Being prepared for delivery";

/** The card after the window closes, before release. */
export const CB_CLOSED_CARD =
  "Your window has closed. We'll send everything out as soon as your last package lands.";

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

/** The FAQ — word for word the website's (swiftboxtt.com/blog/consolidated-billing-trinidad). */
export const CB_FAQ: { q: string; a: string }[] = [
  {
    q: "Is Consolidated Billing the same as package consolidation?",
    a: "Not quite. Package consolidation usually means repacking several orders into one box in Miami. With Consolidated Billing, each package ships as it arrives, and they're delivered together with one bill.",
  },
  { q: "Does Consolidated Billing cost extra?", a: "No. Consolidated Billing is free." },
  {
    q: "How long will you hold my packages?",
    a: "Your 20 days start when your first package arrives at our Miami warehouse. Everything that reaches Miami in those 20 days is delivered together, as soon as the last one lands.",
  },
  {
    q: "Can I get my packages sooner?",
    a: "Yes. 20 days is the most we wait. Once everything you ordered has reached Miami, tap “Send my packages now” in the app and they come to you together as soon as the last one lands. You can also turn Consolidated Billing off.",
  },
  {
    q: "Does Consolidated Billing lower my freight charge?",
    a: "No. Each package is charged on its own actual weight at US$1.99/lb + 20% fuel (US$2.39/lb all-in). What you save is time and hassle: one delivery and one bill instead of several.",
  },
  {
    q: "What does the bill look like?",
    a: "One bill for the whole delivery. Each package is listed with its freight, and its customs duty, OPT and VAT are broken down item by item.",
  },
  { q: "How do I turn on Consolidated Billing?", a: "In the Swiftbox app, or WhatsApp or call us on (868) 609-3000." },
  {
    q: "How will I know my packages have arrived?",
    a: "You get an email when each package reaches our Miami warehouse, and you can track every package in the Swiftbox app.",
  },
  {
    q: "How do I pay?",
    a: "You pay the whole bill at once when your packages are delivered, including in TT$ cash to the driver at your door.",
  },
];
