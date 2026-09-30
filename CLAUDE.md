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

## Consolidated Billing (since migration 033, 2026-09-26)

The admin owns the rules (see SwiftboxAdmin `CLAUDE.md` → "Consolidated Billing
invariants" and `CONSOLIDATED_BILLING_PLAN.md`). This app does exactly three
things, all in `src/lib/consolidation.ts`:

1. **Reads** the opt-in (`users.consolidated_billing`) and the open HOLDING group,
   including the admin's "still expected" snapshot (`expected_count`). The app
   NEVER re-derives what is expected — one rule, one place (admin `expectedFor`).
2. **Opts in / out.** Business-tier and `auto_hold` customers cannot opt in — they
   are billed on terms. **`auto_hold` is NOT consolidation** and is never read as
   a hold. Opting OUT releases any open group immediately.
3. **Releases** the open group ("Deliver what's here now", or opting out) with the
   SAME conditional UPDATE the admin uses (`WHERE status = 'holding'`), setting
   `open_user_id = NULL`, `release_reason = 'customer'`, UTC times. It sends the
   released email itself and stamps `released_notified_at` (+ the members'
   `joined_notified_at`) so the admin's sweep never sends a second one. The admin
   then drafts the ONE consolidated invoice; the app never writes an invoice.
   Straight after a release the app calls the admin's
   `POST /api/consolidation/release-hook` (`requestInstantDraft`, header
   `x-consolidation-key` = `CONSOLIDATION_HOOK_KEY`, `ADMIN_URL` default
   https://admin.swiftboxtt.com, 10 s timeout) so the draft exists at once. A failed
   call never fails the release — the admin's daily cron drafts it instead.

- Status/reason values are VARCHAR vocabularies owned by the admin
  (`holding|released|invoiced`, `all_arrived|deadline|customer|admin`); live MySQL
  is not strict, so never write any other value.
- Notifications are email + the in-app status only (no WhatsApp). The app has no
  notification feed; its in-app surface is the "Held for consolidation · x of y
  arrived · delivers by …" banner (`src/components/ConsolidationBanner.tsx`) and
  the held badge (`packageBadge` in `src/lib/status.ts`).
- The released-email wording is duplicated from the admin
  (`lib/consolidation-email.ts` there) — keep the two in step.
- The invoice view shows "Consolidated Billing saved you TT$X" only when
  `billing_basis = 'consolidated'` AND the stored saving is > 0.
- `scripts/consolidation-cli.ts` drives this module from the command line (the
  admin's `scripts/verify-consolidation-live.ts` uses it for the live check).

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
  on any retired number (703-3600 etc.) anywhere under src/.
