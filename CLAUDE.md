# Swiftbox customer app — standing brief

Next.js 15 (App Router) + Tailwind 4 customer PWA for Swiftbox (Miami → Trinidad
courier). It shares ONE live MySQL 5.6 database with SwiftboxAdmin
(`C:\Dev\SwiftboxAdmin`) and the legacy PHP system. The admin repo's CLAUDE.md is
the authority on the shared tables; this file records what THIS app must not break.
Brent is non-technical — explain in plain language.

## Hard invariants

- **All DB access goes through `src/lib/db.ts`** (the PHP bridge — MySQL :3306 is
  firewalled). `:named` placeholders. MySQL 5.6: no CTEs, no window functions.
- **Deploys come from GitHub `master`.** The Vercel project swiftbox-app IS
  connected to GitHub (since ~2026-09-11; the old "no git integration" note was
  wrong): a push to `master` deploys PRODUCTION, and any other branch push makes a
  protected preview. Never `npx vercel --prod` from a working copy — that is how
  live drifted onto a side branch in Sept 2026. Production must keep
  `CONSOLIDATION_HOOK_KEY`.
- **Customers see ISSUED invoices only** (`lifecycle = 'issued'`); drafts and held
  drafts are never shown.
- **Every query is scoped to the session user** (`getSession()` → `session.id` =
  `users.id`), which doubles as the ownership check.

## Consolidated Billing v2 (Brent's rules of 27 Sep 2026, admin migration 038)

The admin owns every rule — SwiftboxAdmin `CLAUDE.md` → "Consolidated Billing v2"
(R1–R13) and `CONSOLIDATED_BILLING_PLAN.md`. v1 (hold after clearance, one combined
invoice, "Deliver what's here now", the released email) is REMOVED from this app.

**The rules, as they touch this app:** R1 per-customer ON/OFF, free. R2/R3 a group
opens on the first Miami-warehouse entry and runs 20 days (`HOLD_DAYS`). R4 members
fly and clear as normal, then wait. R5 the group closes on day 21 and goes out once
the last package lands. R6 turning it OFF sends out what's ready now; the rest go
separately. R7 released packages show the stage of the last to arrive and come as
ONE delivery. R8 a Miami entry after the window opens a new group. R9 one
Consolidated Bill (CB-######) per release, per package and per customs item. R10 the
per-package invoices are unchanged; the bill only sums them; paying it pays them all.
R11 a package with no invoice at release is billed on its own. R12 (REVISED
2026-10-01): the RATE is unchanged — US$1.99/lb + 20% fuel (US$2.39/lb all-in) — but
the group's AIR freight is charged on its COMBINED EXACT weight, rounded up ONCE (two
0.5 lb packages = 1 lb); since 2026-10-02 INSURANCE is charged ONCE on the group's
combined declared value (each package still covered on its own, up to US$500 — never
word it as one shared cap); duty, OPT, VAT stay per package; no repacking.
The admin prices it (lib/cb-weight-core.ts there) and this app only SHOWS it: the bill
page reads exact weights, the group insurance line and the saving (freight +
insurance) from admin `GET /api/consolidated-billing/bill-weights`
(`fetchCbBillWeights`, same key; the bill still shows if it is unavailable).
**R13 the app NEVER says a package is in, or held in, Trinidad.**

**LIVE since 2026-09-30** (this app `27cf1ba`, admin `50f3046`; admin migration
038 applied). v1's tables are dormant on live pending a separate removal; nothing
here reads them. v1's 4 opt-ins (#0292, #0406, #0410, #0413) start ON in v2 — the
switch reads `users.consolidated_billing`, which v2 reuses.
**How a group closes** is the admin's rule (its CLAUDE.md, "How a group closes"):
day 21 closes it, it goes out once every member is cleared AND its bill is issued,
and the office's Release now or the customer turning the switch OFF sends what has
landed and lets the rest travel on their own. A package that never arrives keeps a
closed group waiting until the office releases it.

**"Send my packages now" (live 2026-10-01, app `928f521`, admin `3c5e874`).** 20 days
is the most a group waits. `SendMyPackagesNow` (own card at the TOP of the Dashboard
and on the page of any package in the open group — `cbInOpenGroup`, Miami included)
and `SendNowPanel` inside the Account card (`showSendNow`). Shown only when
`getCbState().group` is set: the OPEN group with ≥1 package (Buy For Me excluded).
Names the group by description + tracking (`cbWaitingSummary`), "Ships automatically
in N days", and confirms IN the page (no `window.confirm` — it froze the Chrome
extension and is poor on phones). `POST /api/consolidated-billing/release` forwards
only the session's user id + groupId to the admin, which owns every rule (closes the
group as on day 21, refuses anyone else's group, answers "already" to a repeat). The
switch stays ON. After: `preparing` → "Your packages are being prepared for delivery";
cards read "Being prepared for delivery" (`cbPreparing`, only once a package has left
Miami) — still never a stage or a place. A tap broadcasts `CB_STATE_EVENT` so the other
cards on the page update. Copy: `consolidatedBilling.ts`; tests:
`sendMyPackagesNow.test.ts`. The FAQ's "sooner" answer changed — the website's
copy of that FAQ still has the old wording.

**How this app keeps them:**
- **It never writes a Consolidated Billing table or an invoice.** `src/lib/consolidated-billing.ts`
  only reads `swiftbox_cb_*`; the switch calls the admin
  (`POST /api/consolidated-billing/customer-toggle`) and the PDF button fetches it
  (`GET /api/consolidated-billing/bill-pdf`), both with header `x-consolidation-key` =
  `CONSOLIDATION_HOOK_KEY` (`ADMIN_URL` default https://admin.swiftboxtt.com). If the
  admin refuses or can't be reached the switch does not move.
- **R13 in code:** a member of an unreleased group shows `CB_WAITING_LABEL` from the
  moment it leaves Miami (switching only at landing would itself reveal it), and the
  package APIs send such a package as `shipStatus: 1` with every later date nulled —
  its real stage never reaches the browser. Its invoice is hidden (list and detail
  404) until the group releases.
- **Invoices:** a bill's invoices are listed AS the bill (`/dashboard/bills/[billNo]`,
  live totals, PDF via the admin). A child invoice stays viewable and links its bill.
- **Rendering goes through the shared cards only** (see "How a package is named"):
  `PackageCard` reads `cbWaiting` (never v1's `held`) and puts the waiting badge on
  its OWN line under the name — a sentence beside the name squeezes it to two letters
  at 360px; the package detail page shows no header badge while waiting (the
  Consolidated Billing box says it). `BillCard` (Invoices list) and the bill page
  are headed by the packages ("Shoes + 4 more", `billHeadline` / `packagesSummary`)
  with the CB number as the small Ref; each package block leads with description +
  carrier tracking, WR as the ref. `InvoiceCard` never falls back to the invoice
  number as its headline ("Shipment charges" / "Package" instead).
- `/api/invoices` returns each visible invoice's packages AND `bills[]` with
  `packageCount` + `packages` ({wr, tracking, commodities}) read through the bill's
  own links (`listCbBills` → `billPackages`).
- **All copy lives in `src/lib/consolidatedBilling.ts`** (short line, long
  description, confirm, card texts, FAQ, HOLD_DAYS). The arithmetic mirrors the
  admin's pure core in `src/lib/consolidatedBillingCore.ts` — keep the two in step.
- **Buy For Me is completely separate:** a package in `swiftbox_bfm_packages` is never
  shown as waiting for a group, and its invoice is never hidden for one — the reads
  exclude it even before the admin's next run takes it out of its group.
- Until the admin's migration 038 runs the tables are missing and every read answers
  "nothing" (`safe()`), so the rest of the app is unaffected.
- **Play Store data safety: unchanged** — a preference flag and figures already
  declared (purchase history, declared value); the PDF comes from our own admin.

**Copy rules:** only these claims — free; 20 days from the first Miami arrival;
delivered together as soon as the last package lands; one bill with a per-item
customs breakdown; rates unchanged per package; no repacking. Never "cheapest", "no
hidden fees", delivery dates or times, competitor names or volume numbers. Wherever
US$1.99 appears, the 20% fuel is on the same line. The only phone number is
(868) 609-3000.

## Install page and reminder (2026-09-29)

- **`/install` is PUBLIC** ("Get the Swiftbox app"); swiftboxtt.com/app 307s to
  it. It must stay on THIS origin — iPhone's Add to Home Screen saves the site
  that is open. The home-screen icon still opens `/`: the manifest's
  `start_url` is `/` and `scope` `/`, and current iOS launches web clips at
  start_url. Never make /install the start_url.
- Detection is pure in `src/lib/install-env.ts` (tested); browser reads are in
  `src/lib/install-client.ts`. One panel shows at a time: installed / in-app
  browser / Android / iPhone / computer (QR for swiftboxtt.com/app, a static SVG
  in `public/install/`).
- **`PLAY_STORE_URL` is empty on purpose** — the Play listing 404'd on
  2026-09-29. Paste the listing URL there when it goes public; that is the only
  change needed to show "Get it on Google Play".
- Screen recordings: `public/install/iphone.mp4` / `android.mp4` (optional
  `-poster.jpg`). Checked at BUILD time — a missing file renders nothing, and a
  new file needs a redeploy.
- The reminder bar (`InstallReminder`, inside TabBar's nav) shows only on a
  phone, in a browser tab, not installed, not in the TWA, not snoozed (14 days,
  localStorage). While visible it sets `--sb-reminder-h` on <html>; anything
  fixed near the bottom of the dashboard must add it (main's padding and the
  pre-alerts "+" do).

## Pick-to-prealert (since 2026-09-29)

The admin owns the rule (SwiftboxAdmin `CLAUDE.md` → "Pick-to-prealert nudges",
`PREALERT_PICK_PLAN.md`). This app shows packages we already hold that still need a
pre-alert and lets the customer confirm one.

- **NEEDS_PREALERT lives in `src/lib/prealert-needs.ts`, code-identical to the
  admin's `lib/prealert-needs.ts`.** Every list, count, form and submit goes
  through it (`src/lib/prealert-pick-server.ts`); never write a second copy.
- **Ownership is in every query** (`p.user_id = :userId`), so another customer's
  package id answers exactly like a missing one — the closed message.
- **A picked pre-alert is an ordinary `swiftbox_prealerts` row** (the manual
  form's table and tracking-string link). It is written by ONE conditional
  `INSERT … SELECT` whose SELECT carries ownership + NEEDS_PREALERT; tracking,
  store, freight and piece count come from the package row, never the client.
  0 rows → re-check → "already" or closed; a deadlock victim whose package is
  still open retries. Don't add a pre-check-then-insert.
- **Demo account (#0364)**: its packages show in the card/list/badge, but a
  submit is a dry run — nothing is ever written for it (`isPlayDemoSql`).
- Deep link `/dashboard/prealert/{pk_id}` survives login through `?next=`
  (`src/lib/next-path.ts` `safeNext`, `/dashboard` and `/account` only).

## Pre-alert invoice upload (since 2026-09-30)

- Optional invoice/receipt on BOTH pre-alert forms (`src/components/InvoiceFileField.tsx`).
  The pre-alert is saved FIRST; the file is attached afterwards by
  `POST /api/prealerts/[id]/file`, so a failed upload never loses the pre-alert —
  the customer is told ("saved, but the invoice didn't upload"). Never make the
  file required and never send it with the pre-alert itself.
- Stored like Buy For Me slips: through this server into the PRIVATE blob store
  (`BLOB_READ_WRITE_TOKEN`, store swiftbox-admin-blob), type from the first bytes
  (JPEG/PNG/WebP/PDF), 4 MB, random path `prealert-invoices/<id>/<32 hex>`, one
  file per pre-alert (UNIQUE), ownership in the query. The blob URL is never
  returned. The admin streams it to staff.
- `GET /api/prealerts/uploads` switches the field on only when the table
  (`swiftbox_prealert_files`, SwiftboxAdmin migration 041) exists and a token is set.
- The pick submit returns `prealertId` on "saved" so the file can attach to it.

## How a package is named (since 2026-09-30)

- **Headline = description, second line = carrier tracking number, WR/SWF =
  small "Ref".** Every customer-facing package display goes through
  `src/lib/packageDisplay.ts` (`packageIdentity`, `trackingNumbers`,
  `displayTitle`, `detectCarrier`) and the shared `PackageCard` / `TrackingLine`
  / `RefText` / `InvoiceCard` / `CopyTracking` components. Don't reintroduce
  `packageCode || wr` as a title. Display only — nothing stored changes.
- **A carrier label is shown only when the check digit agrees** (UPS 1Z, FedEx
  12/15, USPS 9[1-5] 20–22/26, Amazon TBA). Never add a carrier on pattern
  alone: a wrong label is worse than none. FedEx 34-digit and USPS 420+ZIP label
  barcodes are unwrapped to the customer's number only after the inner number
  validates; otherwise the stored value is shown as-is. DEMO numbers (Play
  demo #0364) must never get a label — asserted in `packageDisplay.test.ts`.
- `/api/invoices` returns each issued invoice's packages, reached only through
  the customer's issued headers (never the child table on its own).
- The Packages screen has no search box; if one is added, match tracking
  (compacted, case-insensitive, last 4+), description and WR/SWF.

## Verification

`npx tsc --noEmit`, `npx vitest run`, `npx next build` — all clean before a deploy.
Don't run a build while a dev server for this app is running (it corrupts `.next`).

## Referral sharing (2026-09-30)

- The share link is `swiftboxtt.com/r/CODE` (`inviteLink` / `shareMessage` in
  `src/lib/referral.ts`), still locked to swiftboxtt.com by `resolveSignupBase`.
- Share taps go to `/api/referral/share`, which reads the code from the
  signed-in customer's row and forwards to SwiftboxAdmin
  (`REFERRAL_HOOK_KEY`). Never trust a code from the request.
- "Your referrals" (`getReferralList`, `src/lib/referral-list.ts`): first name
  + last initial only. "credit being checked" = the admin HELD the TT$100 as a
  possible self-referral.
- WhatsApp number is (868) 609-3000; `src/lib/whatsapp-number.test.ts` fails
  on any retired number (the old WhatsApp lines) anywhere under src/.

## Buy For Me is PAUSED (2026-10-01) — behind the admin's settings switch

Brent paused Buy For Me on 2026-10-01 (no USD to buy goods for customers). A
PAUSE, not a removal: every page, route and table stays.

- **The switch** is the `bfm_enabled` row in `swiftbox_settings`, set only in the
  admin (Settings → **Buy For Me service**). ON only when it holds exactly 1;
  missing, unreadable or a failed read = OFF. The ONLY reader here is
  `isBfmEnabled()` in `src/lib/bfm-switch.ts` (pure part and the paused wording:
  `src/lib/bfm-switch-core.ts`, an identical copy of the admin's). Never read the
  row anywhere else.
- **Turn it back on:** in the admin, Settings → Buy For Me service → "Turn Buy For
  Me on…". No deploy needed here — the next request reads the switch. The public
  website is separate: `BFM_ENABLED` in its `src/lib/buyForMe.ts`.
- **While OFF:** the dashboard card is not shown (a customer with OPEN requests gets
  `BuyForMeOrdersLink`, a plain link to them); `/dashboard/buy-for-me/new` shows
  `BfmPaused` (the message + a link to the Miami address, `/dashboard/account`);
  the list shows `BfmPaused` when empty, otherwise the requests read-only under the
  compact note; a request page shows the paused note, the quote without bank
  details, payment reference or upload (`getMyRequest` returns `paused`,
  `bank: null`, `canUploadSlip: false`); cancelling an unpaid request still works.
  `POST /api/buy-for-me` and `POST /api/buy-for-me/[id]/slip` answer 403
  `{ error: BFM_PAUSED_MESSAGE, paused: true }`, and `createRequest` / `uploadMySlip`
  refuse on their own too. The GET routes keep working.
- The pages read the switch once in `src/app/dashboard/buy-for-me/layout.tsx`
  (`BfmEnabledProvider` / `useBfmEnabled` in `paused.tsx`); the context defaults to
  OFF.
- Tests: `src/lib/bfm-switch.test.ts` (OFF hides and blocks; ON is today's behaviour).

## Buy For Me (SwiftboxAdmin BUY_FOR_ME_PLAN.md — the admin owns the rules)

- `src/lib/buy-for-me-core.ts` is an IDENTICAL copy of the admin's
  `lib/buy-for-me-core.ts` (statuses, the quote calculator, `cleanText`,
  `safeProductUrl`). Change it in the admin and copy it here; never edit only one.
  This app never recalculates a quote — it shows the frozen `swiftbox_bfm_quotes` row.
- The customer can only: create a request (`submitted`), upload a slip
  (`quoted` → `payment_uploaded`), and cancel while nothing is paid. Every write is
  conditional on the status and scoped `WHERE user_id = :userId`.
- **Payment slips are private.** They go through `/api/buy-for-me/[id]/slip`
  (server-side `put`, `access: 'private'`, type checked by first bytes, 4 MB max,
  path `bfm-slips/<id>/<32 hex>`) into the private store `swiftbox-admin-blob`.
  `blob_url` is never selected into a page or API response; the only reader is
  `/api/buy-for-me/slip/[slipId]`, which streams the customer's OWN slip and
  answers 404 to anyone else.
- All customer text goes through `cleanText` (the bfm tables are 3-byte utf8).
- Payment methods are shown with `paymentLabel` (`src/lib/payment-label.ts`),
  never raw. There is NO Buy For Me credit (2026-09-27): refunds are bank
  transfer only, and nothing is ever applied to an invoice.
- Login returns to `?next=` only through `safeNext` (`src/lib/next-path.ts`). It
  accepts only a plain path under `/dashboard` or `/account` — no scheme, `//`,
  backslash, control characters or `.`/`..` segments (`src/lib/next-path.test.ts`).
- **ALL-IN quotes (admin migration 043, BUY_FOR_ME_PLAN.md §10).** The amount to
  pay for a quote is `grand_total_ttd` when set, else `total_ttd` (purchase-only,
  or 043 not run). Read through `src/lib/buy-for-me-quote.ts` (`allInFromRow`,
  `amountDueTtdCents`) — never recalculated. `swiftbox_bfm_quotes` is read with
  `SELECT *` so the 043 columns are NEVER named in SQL: a missing column is just
  absent and reads as a purchase-only quote. The breakdown is item · US tax · US
  shipping · service fee (the quote's frozen `fee_pct`) · "Freight, fuel &
  insurance to Trinidad" (`courier_ttd`, with a US$ caption) · Duty · OPT (> 0) ·
  VAT · Other taxes (> 0) · Total to pay, then the estimated-weight sentence
  (`allInNotice`).
- **Payment is bank deposit / bank transfer ONLY** — every payment screen shows
  `PAYMENT_ONLY_LINE` (no card, LINX, PayPal or cash on delivery). The rules copy
  reads `bfm_fee_pct` from `swiftbox_settings` (`getBfmFeePct`, fallback 15);
  never hardcode the percentage. Nothing is bought until staff confirm payment.
- History titles go through `bfmEventTitle` (base titles from the core copy, plus
  `landed_invoiced` / `extra_charges`); an unknown kind shows "Update on your
  request", never the raw code.
- **Separate from Consolidated Billing.** `src/lib/consolidated-billing.ts`
  excludes `swiftbox_bfm_packages` from every "waiting for your group" read
  (`excludingBfm`, which retries without the clause if that table is missing).
