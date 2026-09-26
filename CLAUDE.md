# Swiftbox customer app — standing brief

Next.js 15 (App Router) + Tailwind 4 customer PWA for Swiftbox (Miami → Trinidad
courier). It shares ONE live MySQL 5.6 database with SwiftboxAdmin
(`C:\Dev\SwiftboxAdmin`) and the legacy PHP system. The admin repo's CLAUDE.md is
the authority on the shared tables; this file records what THIS app must not break.
Brent is non-technical — explain in plain language.

## Hard invariants

- **All DB access goes through `src/lib/db.ts`** (the PHP bridge — MySQL :3306 is
  firewalled). `:named` placeholders. MySQL 5.6: no CTEs, no window functions.
- **Deploys are manual:** commit, then `npx vercel --prod`. There is no git
  integration.
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

## Verification

`npx tsc --noEmit`, `npx vitest run`, `npx next build` — all clean before a deploy.
Don't run a build while a dev server for this app is running (it corrupts `.next`).
