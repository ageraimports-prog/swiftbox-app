# Swiftbox → Google Play submission playbook

Target: publish the Swiftbox customer PWA (`app.swiftboxtt.com`) to Google Play as a
Trusted Web Activity, built with Bubblewrap.

A TWA is not a webview wrapper. It runs the real site in a Chrome engine with no
address bar, verified by a Digital Asset Links file that proves you own the domain.
Google explicitly supports this. Get the asset links wrong and it degrades into a
browser window with a URL bar — which reviewers reject.

Written 11 September 2026. The target-API deadline below has already passed, so the
API 36 step is not optional.

---

## Locked decisions

| Thing | Value | Can it change later? |
|---|---|---|
| Package / Application ID | `com.swiftboxtt.app` | **Never.** Permanent for the life of the listing. |
| Play app title | `Swiftbox: Package Forwarding` (28/30 chars) | Yes |
| Launcher label | `Swiftbox` | Yes, via manifest `short_name` |
| Domain | `app.swiftboxtt.com` | Effectively no |
| Signing | Play App Signing (Google holds the real key) | No |
| Target API | 36 (Android 16) | Must stay ≥ current requirement |
| Account type | Organisation — no 12-tester closed-testing requirement | — |

---

## What is already done in `C:\Dev\SwiftboxApp`

Committed to your working tree, not yet built or deployed. Review the diff before you push.

| File | What changed |
|---|---|
| `src/app/manifest.ts` | Added `id`, `scope`, `orientation`, `lang`, `categories`, `display_override`, `prefer_related_applications: false`, three app shortcuts, and a real maskable icon |
| `next.config.ts` | Rewrite `/.well-known/assetlinks.json` → `/api/assetlinks` |
| `src/app/api/assetlinks/route.ts` | **New.** Serves the Digital Asset Links statement. Fingerprint placeholder to fill in at Phase 4 |
| `src/app/delete-account/page.tsx` | **New.** Public account-deletion page — Play requires this |
| `src/app/delete-account/DeleteAccountForm.tsx` | **New.** The form |
| `src/app/api/account/delete-request/route.ts` | **New.** Emails the request to support, acks the customer |
| `src/lib/account-deletion-email.ts` | **New.** Both emails, reusing the existing SMTP transport |
| `src/app/dashboard/account/page.tsx` | Added the in-app "Delete my account" link |
| `public/icons/icon-192.png`, `icon-512.png` | Regenerated — mark scaled up, transparent-cut and re-composited cleanly |
| `public/icons/icon-512-maskable.png` | **New.** Mark sits inside the inner 80% safe circle so Android's crop doesn't clip it |
| `public/icons/shortcut-*.png` | **New.** Long-press shortcut icons |

Nothing touches auth, packages, pre-alerts, invoices or the referral logic.

---

## Phase 0 — Deploy the web changes first

Bubblewrap reads the **live** manifest, so this has to ship before anything else.

```powershell
cd C:\Dev\SwiftboxApp
git diff
```

```powershell
cd C:\Dev\SwiftboxApp
npm run build
```

If the build is clean, commit and push (Vercel deploys on push):

```powershell
cd C:\Dev\SwiftboxApp
git add -A
git commit -m "Play Store prep: manifest, asset links, account deletion, icons"
git push
```

Then check all four of these load in a browser:

```
https://app.swiftboxtt.com/manifest.webmanifest
https://app.swiftboxtt.com/icons/icon-512-maskable.png
https://app.swiftboxtt.com/delete-account
https://app.swiftboxtt.com/.well-known/assetlinks.json
```

The last one will show `REPLACE_WITH_PLAY_APP_SIGNING_SHA256` for now. That is expected —
it gets the real value in Phase 4.

Also send yourself a test through `/delete-account` and confirm the email lands at
`info@swiftboxtt.com`. Play reviewers do open this page.

---

## Phase 1 — Toolchain

Bubblewrap needs Node 14.15 or newer — you already have that for Next.js. Check, then install it globally:

```powershell
node --version
```

```powershell
npm install -g @bubblewrap/cli
```

```powershell
bubblewrap --version
```

First run will offer to download JDK 17 and the Android command-line tools. Say yes and let
it — it puts them somewhere isolated and does not touch anything else on your machine.
It is roughly a 1 GB download.

---

## Phase 2 — Generate and build the Android project

Keep the Android project **outside** the Next.js repo so it never ends up on Vercel:

```powershell
mkdir C:\Dev\SwiftboxAndroid
```

```powershell
cd C:\Dev\SwiftboxAndroid
bubblewrap init --manifest https://app.swiftboxtt.com/manifest.webmanifest
```

Answer the prompts exactly as below. Anything not listed, press Enter to accept the default.

| Prompt | Answer |
|---|---|
| Domain being opened in the TWA | `app.swiftboxtt.com` |
| Name of the application | `Swiftbox: Package Forwarding` |
| Name to be shown on the launcher | `Swiftbox` |
| Application ID | `com.swiftboxtt.app` |
| Starting version code | `1` |
| Display mode | `standalone` |
| Orientation | `portrait` |
| Status bar colour | `#0E1114` |
| Splash screen colour | `#0E1114` |
| Icon URL | `https://app.swiftboxtt.com/icons/icon-512.png` |
| Maskable icon URL | `https://app.swiftboxtt.com/icons/icon-512-maskable.png` |
| Monochrome icon URL | leave blank |
| Include support for Play Billing | `No` |
| Request geolocation permission | `No` |
| Include app shortcuts | `Yes` |
| Key store location | `./android.keystore` |
| Key name | `android` |

It will ask you to create a keystore password and a key password. **Write both down now
and put them somewhere you will still have in three years** — a password manager, not a
sticky note. Same for the `android.keystore` file itself.

### Bump the target API to 36 — do not skip this

Bubblewrap 1.13.2 still generates `targetSdkVersion 35`. Since 31 August 2026 Play rejects
new submissions below 36. Open the generated file:

```powershell
notepad C:\Dev\SwiftboxAndroid\app\build.gradle
```

Find `targetSdkVersion 35` and change it to:

```
targetSdkVersion 36
```

Leave `compileSdkVersion 36` and `minSdkVersion` alone. Save and close.

> If you ever run `bubblewrap update`, it regenerates `build.gradle` and this edit is
> lost. Re-apply it before every build.

### Build

```powershell
cd C:\Dev\SwiftboxAndroid
bubblewrap build
```

You get two files in `C:\Dev\SwiftboxAndroid`:

- `app-release-bundle.aab` — this is what you upload to Play
- `app-release-signed.apk` — sideload this onto your own phone to test

> Bubblewrap has its own `bubblewrap fingerprint add` command that writes an
> `assetlinks.json` next to the project. Ignore it. It uses your **local** keystore
> fingerprint, which is the wrong one, and your Next.js app serves the file anyway.

Sanity-check the target API made it through:

```powershell
cd C:\Dev\SwiftboxAndroid
Select-String -Path .\app\build.gradle -Pattern "targetSdkVersion"
```

---

## Phase 3 — Create the app in Play Console and do a first upload

Play Console → **Create app**.

| Field | Value |
|---|---|
| App name | `Swiftbox: Package Forwarding` |
| Default language | English (United States) — or English (United Kingdom) |
| App or game | App |
| Free or paid | Free |
| Declarations | Tick both (developer programme policies, US export laws) |

Then: **Test and release → Testing → Internal testing → Create new release**.

Upload `app-release-bundle.aab`. Add yourself as an internal tester.

Do this before the store listing is finished — the upload is what generates the Play App
Signing key you need next.

---

## Phase 4 — Digital Asset Links (the step everyone gets wrong)

Google re-signs your upload with **its own** key. The fingerprint that has to be in
`assetlinks.json` is Google's, not the one in your local keystore.

Play Console → your app → **Test and release → Setup → App signing**.

Copy the **SHA-256 certificate fingerprint** under "App signing key certificate". It looks like
`AB:CD:12:...` — 32 colon-separated pairs.

While you are on that page, also copy the SHA-256 under **Upload key certificate**. Listing
both lets the sideloaded APK verify too, which is how you test before release. Extra
fingerprints are harmless.

Now open:

```powershell
notepad C:\Dev\SwiftboxApp\src\app\api\assetlinks\route.ts
```

Replace `REPLACE_WITH_PLAY_APP_SIGNING_SHA256` with both fingerprints, comma-separated on one line:

```
"AA:BB:CC:...:11,DD:EE:FF:...:22"
```

Then deploy:

```powershell
cd C:\Dev\SwiftboxApp
git add -A
git commit -m "Add Play app signing fingerprints to asset links"
git push
```

Verify — this URL must return a JSON array containing your real fingerprints:

```
https://app.swiftboxtt.com/.well-known/assetlinks.json
```

And run Google's own checker:

```
https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://app.swiftboxtt.com&relation=delegate_permission/common.handle_all_urls
```

You want `"maxAge"` and your statement back, with no `errorCode`.

**Then install the app from internal testing on a real phone.** If there is no address bar
at the top, asset links are working. If there is one, the fingerprint is wrong — fix it
before you go any further, because Play will reject a TWA that shows browser chrome.

---

## Phase 5 — Store listing

Play Console → **Grow → Store presence → Main store listing**.

**App name** (30 max):

```
Swiftbox: Package Forwarding
```

**Short description** (80 max):

```
Your Miami address for Trinidad. Pre-alert, track and pay for every package.
```

**Full description** (4000 max) — paste as-is:

```
Swiftbox gives you a Miami address and brings your online shopping home to Trinidad.

Shop any US store, ship to your free Swiftbox Miami address, and we handle the rest: customs clearance, duties, and delivery or collection in Trinidad. This app is where you run it all from.

YOUR MIAMI ADDRESS
Every Swiftbox customer gets a personal Miami shipping address, with an AIR and a SEA option. Copy it straight out of the app into any US checkout form.

PRE-ALERT IN SECONDS
Tell us a package is coming before it lands. Enter the store, the US tracking number, what is inside and the invoice total, and we can clear it the moment it arrives instead of waiting on paperwork.

TRACK EVERY PACKAGE
See exactly where each package is: received at the Miami warehouse, in transit, landed, clearing customs, ready for collection, delivered. No guessing and no calling to check.

SEE WHAT YOU OWE
Every invoice in one place with freight, duty and charges broken out, so you know the total before you come in.

EARN CREDIT FOR REFERRALS
Share your referral code with friends and family. When someone you refer ships their first package, you earn TT$100 credit toward your own shipping.

BUILT FOR TRINIDAD AND TOBAGO
Swiftbox is a licensed Trinidad customs broker, not a middleman. Prices in TTD, WhatsApp support on a local number, and a team that knows what actually clears.

Not a Swiftbox customer yet? Sign up free at swiftboxtt.com and your Miami address is ready in minutes.

Questions? WhatsApp us at 1 (868) 703-3600.
```

> The TT$100 figure comes from `REFERRAL_CREDIT_TTD` in your env. If you change that,
> change this listing too — a listing that promises something the app doesn't deliver is a
> policy issue, not just a typo.

**Graphics** — in `store-assets/`:

| Slot | File | Spec |
|---|---|---|
| App icon | `play-icon-512.png` | 512 × 512, 32-bit PNG ✓ |
| Feature graphic | `play-feature-graphic-1024x500.png` | 1024 × 500, 24-bit PNG ✓ |
| Phone screenshots | you need to capture these | min 2, max 8; 1080 × 1920 portrait |

### Capturing the screenshots

Play requires real screenshots of the actual app — mock-ups of screens that don't exist are
a rejection reason. Quickest way on your machine:

1. Open `https://app.swiftboxtt.com` in Chrome and sign in with a real account
2. `F12` → click the phone/tablet icon (or `Ctrl+Shift+M`)
3. Set the device dropdown to **Responsive**, type `1080` × `1920`, set zoom to 100%
4. On each screen: the `⋮` menu at the top-right of the device toolbar → **Capture screenshot**

Capture these four, in this order — they read as a story:

1. Dashboard home (packages summary)
2. Packages list with a few different statuses
3. New pre-alert form
4. Account screen showing the Miami address

Use a real account with realistic package data. If you'd rather not show your own account,
make a demo customer with a few sample packages — that same account doubles as the
reviewer login in Phase 6.

Drop the four PNGs in a folder and I'll compose them into framed, captioned store
screenshots if you want them to look sharper than raw captures.

---

## Phase 6 — App content declarations

Play Console → **Policy → App content**. Every one of these has to be green before you can
release to production.

| Declaration | Answer |
|---|---|
| Privacy policy | `https://swiftboxtt.com/privacy` |
| Ads | No, this app does not contain ads |
| **App access** | **All or some functionality is restricted** — see below |
| Content rating | Complete the questionnaire; answer No to everything. Category: Utility / Productivity / Communication |
| Target audience | 18+ only. Not appealing to children |
| News app | No |
| COVID-19 apps | No |
| Data safety | See the table below |
| Government apps | No |
| Financial features | My app doesn't provide any financial features |
| Health apps | No |

### App access — the single most common rejection

Your app is entirely behind a login. A reviewer who can't get in fails the review. Add an
instruction set:

- **Name:** `Customer login`
- **Username:** a real demo customer email
- **Password:** its password
- **Any other instructions:**

```
Swiftbox is a package-forwarding service for Trinidad & Tobago customers. All features are behind a customer login. Sign in with the credentials above to see the dashboard, package tracking, pre-alert form, invoices and account screens. Accounts are created by Swiftbox when a customer registers at swiftboxtt.com; there is no public self-signup inside the app. Account deletion can be requested at https://app.swiftboxtt.com/delete-account without signing in.
```

Create that demo account before you submit, leave a few sample packages and one invoice on
it, and do not delete it later — Play re-reviews on every update.

### Data safety

Based on what the app actually collects today. Re-check this if you add analytics, payments
or receipt uploads.

**Does your app collect or share any of the required user data types?** Yes
**Is all user data encrypted in transit?** Yes
**Do you provide a way for users to request that their data is deleted?** Yes —
`https://app.swiftboxtt.com/delete-account`

| Data type | Collected | Shared | Purpose | Required or optional |
|---|---|---|---|---|
| Personal info → Name | Yes | No | App functionality, Account management | Required |
| Personal info → Email address | Yes | No | App functionality, Account management | Required |
| Personal info → Address | Yes | No | App functionality | Required |
| Personal info → Phone number | Yes | No | App functionality, Customer support | Required |
| Personal info → Other info (package contents, declared value) | Yes | No | App functionality | Required |
| Financial info → Purchase history | Yes | No | App functionality | Required |

Everything else: No.

Notes on the two answers people get wrong:

- **"Shared" is narrower than it sounds.** Play excludes transfers to service providers,
  transfers for legal or regulatory compliance, and transfers the user specifically
  initiates. Your customs filings are a legal obligation, so they are not "shared" under
  Play's definition. Your privacy policy still has to disclose them — it does.
- **No analytics SDK is in the app today**, so nothing under App activity or Device IDs
  applies. If you ever add Vercel Analytics or similar, come back and update this.

---

## Phase 7 — Release

1. **Test and release → Testing → Internal testing** — install on your own phone from the
   Play link, not the sideloaded APK. Check: no address bar, back button behaves, login
   persists after closing the app, offline screen appears in airplane mode, WhatsApp and
   Call buttons open the right apps.
2. **Test and release → Production → Create new release**
3. Upload the same `.aab` (or a rebuilt one)
4. Release notes:

```
First release. Get your Miami address, pre-alert packages, track every shipment and see your invoices — all from your phone.
```

5. Countries: Trinidad and Tobago at minimum. Add the rest of the Caribbean, the US and
   Canada if you want diaspora customers to be able to install it.
6. **Send for review.**

First review typically takes a few days and can stretch to a week or two. Updates are
faster.

---

## Known rejection causes, in the order they bite

1. **Address bar visible** — asset links fingerprint wrong, or you used the local keystore
   fingerprint instead of Play's.
2. **Reviewer can't log in** — App access instructions missing or the demo account expired.
3. **targetSdkVersion 35** — Bubblewrap's default. Upload is blocked outright.
4. **No account deletion URL** — required for any app with accounts.
5. **"Minimum functionality" / webview wrapper** — mitigated by being a verified TWA of a
   real service with app shortcuts, offline handling and standalone display. If it ever
   comes up, point at the Digital Asset Links verification.
6. **Screenshots that don't match the app** — use real captures.

---

## Updating the app later

Web changes need no new release — the TWA loads the live site, so a Vercel deploy is live
on phones immediately. You only rebuild the Android app when the icon, name, shortcuts or
target API change:

```powershell
cd C:\Dev\SwiftboxAndroid
bubblewrap update
```

```powershell
notepad C:\Dev\SwiftboxAndroid\app\build.gradle
```

(re-apply `targetSdkVersion 36`)

```powershell
cd C:\Dev\SwiftboxAndroid
bubblewrap build
```

Then upload the new `.aab` to a new production release.

---

## Back up these three things

If you lose them you cannot ship an update under this listing:

- `C:\Dev\SwiftboxAndroid\android.keystore`
- The keystore password and key password
- The Play Console account access itself

Copy the keystore somewhere off this machine today.
