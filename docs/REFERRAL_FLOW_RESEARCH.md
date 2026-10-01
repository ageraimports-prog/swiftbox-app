# Referral flow research: web page, WhatsApp bot, or both?

Prepared 2026-09-30 for Brent. This is research and a recommendation only. No code, config, database or n8n workflow was changed.
Everything under "today" was checked against the code on `origin/master` of each repo, the live n8n workflow (read-only), and read-only counts from the live database.

---

## 1. Recommendation (the 2-minute version)

**Go with a hybrid: a personal invite link that opens a signup page, with a "Chat with us on WhatsApp" button on it for people who want to talk first. This is Option D below.**

When a customer taps **Share on WhatsApp** in the app, their friend gets a short message and a link like `swiftboxtt.com/r/K7M2QX`. Tapping it opens our signup page with a banner along the lines of *"Kezia invited you — TT$50 off your first Swiftbox invoice"*. The code is already filled in, and the site remembers it for 60 days in case the friend leaves and comes back. Friends who would rather ask questions first tap *Chat with us on WhatsApp*. The bot then picks up the code automatically, not by hoping the AI remembers it.

Why not send friends straight to the WhatsApp bot to sign up there?

1. **The bot can't reliably keep hold of the code.**
   - A WhatsApp pre-filled message is only a draft, and the friend can delete or edit it before sending.
   - WhatsApp gives us no hidden "who sent you" tag for ordinary links. That only exists for paid click-to-WhatsApp ads.
   - Today the code survives only if the AI remembers it until the very last question. The bot also forgets the chat after a 30-minute gap.
   - A link keeps the code in the web address itself, which nobody can mistype.
2. **Chat signups barely finish today.**
   - Since July the bot has started 5 signups, and only 1 was completed.
   - The website started 69 signups in September, and 63 were completed.
   - Signing up in chat still ends with "check your email, tap the link, choose a password", so it isn't shorter. It also means typing an email address and an ID number into a chat.
3. **WhatsApp bot replies stop being free tomorrow (1 October 2026).**
   - Meta starts charging for every reply inside the 24-hour window.
   - Resellers report the first 1,000 a month per number stay free. Our bot sent 226 in September, so the real cost is about zero today. But it is no longer "free forever", and any follow-up after 24 hours needs a paid template.
   - A web page costs nothing per signup.
4. **Spam stays shut.**
   - The web path keeps the honeypot, the per-IP limit and the email check we already have.
   - The TT$50 can't be farmed with fake accounts, because it only comes off a real invoice for a real package.
   - The TT$100 only pays when the friend's first package is delivered.

**The biggest problem isn't web against WhatsApp: hardly anyone is using the referral programme at all.**
- 97 customers have a referral code.
- Only 1 referral has ever been recorded.
- No referral credit has been paid out yet.

So the plan below also fixes how easy sharing is, and adds tracking so we can see where people drop off.

---

## 2. What happens today, and where referrals get lost

### The referrer's side (customer app, `C:\Dev\SwiftboxApp`)

- **The card** is `src/app/dashboard/ReferralCard.tsx`, headed "Give TT$50, get TT$100". It has two buttons:
  - **Copy** copies the 6-character code only, not a link (`navigator.clipboard.writeText(code)`).
  - **Share on WhatsApp** is a plain link to `https://wa.me/?text=…`, which opens WhatsApp's contact picker. There is no native share sheet (`navigator.share`) and no QR code.
- **The message** is built by `whatsappShareUrl` in `src/lib/referral.ts` (around line 280). It reads:
  > Hey! I've been using Swift Box to ship my online orders down to Trinidad and the service and rates are unmatchable 📦 Use my referral code **CODE** when you sign up and you'll get TT$50 off your first shipment.
  > https://swiftboxtt.com/signup?ref=CODE
- **The code travels** as the `?ref=` query parameter. The base address is hard-wired to `https://swiftboxtt.com`, and a vitest test (`57e0dde`) locks it to the website signup.
- **Where codes come from:** the `referral_codes` table (customer_id = users.id, code). A random 6-character code is created the first time the dashboard loads (`ensureReferralCode`).
- **Status view:** `ReferralEarningsCard.tsx` shows totals only: earned, available, applied, and how many are qualified or pending. It does not show who was referred or how far along each person is.
- **No tracking:** there is no analytics event anywhere in the app, so share taps are invisible.
- **Link previews:** the app has no OG (link-preview) tags except on `/install`. That's fine for now, because the shared link points at the website.

### The friend's side: website signup (`C:\Dev\SwiftBox Rebranded Website`)

- **Reading the code:** `src/app/signup/page.tsx:247` reads `?ref=` into the "Referral code" field. The field sits behind "Have a referral code? Get TTD $50 off your first shipment" and opens by itself when `?ref` is present.
- **Fields:** first name, last name, email, mobile (a +1 868 box that takes 7 digits), password, town (the zone is worked out from it), and the terms tick-box. Street address, ID and instructions are optional and folded away.
- **Anti-bot:** a honeypot field, 5 signups per IP per hour, and every attempt logged to `signup_attempts`. There is no captcha.
- **Handing the code on:** `src/app/api/auth/register/route.ts` passes it on as both `referral` and `notes`. `livetrack-api/register.php` checks it against `referral_codes` and saves it in `pending_signups.referral`.
- **Linking the referral:** when the friend clicks the email link, `verify.php` creates the user. Then `verify_link_referral()` (lines 81–113) inserts a `referrals` row (referrer, friend, `pending`).
- **The credits** (admin, `lib/referrals.ts`):
  - The **referrer gets TT$100** when the friend's first package is delivered (`issueReferralCreditsForDeliveredPackages`).
  - The **friend gets TT$50**, created when their first invoice is issued (`ensureWelcomeCreditForReferredCustomer`, referrals from 2026-09-13 onward).
  - Credits are used whole, oldest first, and never push an invoice below zero. So if the first invoice is under TT$50, the credit waits for the next one.
- **Link preview:** `/signup` shows "Get Your Free Miami Address | Swiftbox T&T" with `/og-image.png` (1200×630). The preview is generic, not personal.

### The friend's side: the WhatsApp bot (live n8n, read-only)

- **Which number:** the bot answers on **+1 (868) 609-3000** (WA Config node, WABA "Swiftbox"). The brief said 703-3600, but commit `d254fbb` (24 Sep) moved WhatsApp and calls onto 609-3000, and the website and app both use 609-3000 now.
- **How it signs people up:** it follows a set protocol in "Build AI Request":
  1. name, email and mobile;
  2. ID or passport, and street plus town;
  3. a read-back that also asks "Any referral code or special delivery instructions?";
  4. after a yes, it calls `register_customer`.
  "Handle Tool Code" then posts to `swiftboxtt.com/api/auth/register` using the agent secret. That creates the "confirm your email and **set your password**" signup.
- **How the code gets through:** only as `args.referral`, i.e. whatever the AI decides to pass along. Nothing in the flow looks for a code by rule.
- **Memory:** "Load History" wipes the conversation if the last message was more than 30 minutes ago. A code the friend sent in their first message is gone if they finish signing up later.
- **Ad tracking only:** `msg.referral` from click-to-WhatsApp ads becomes `lead_source`. Ordinary wa.me links carry nothing like it.
- **The older Next.js webhook** in the website repo (`src/app/api/whatsapp/webhook/route.ts`) is a plain chat relay and has **no signup flow**. The n8n workflow is the only real bot.

### Where referrals are lost (in order of impact)

| # | Leak | Evidence |
|---|---|---|
| 1 | **Hardly anyone shares.** There's no share sheet, no QR code, Copy gives only the code, and nothing prompts people at happy moments. | 97 codes, 1 referral ever (live, 2026-09-30) |
| 2 | **The code is forgotten if the friend leaves.** It only lives in the page's memory: no cookie and no localStorage. Coming back to swiftboxtt.com later loses it. | `signup/page.tsx:269` `useState(refFromUrl)` |
| 3 | **The WhatsApp path relies on the AI remembering the code.** It is only asked for at the read-back, and chat memory resets after 30 minutes. | Build AI Request rule 7; Load History 30-min cut |
| 4 | **Chat signups rarely finish.** The "check your email and set a password" step loses people. | 5 bot signups ever, 1 verified |
| 5 | **An unknown or mistyped code isn't flagged until after submitting**, and `verify.php` throws away the link result. | `signup/page.tsx:190`, `verify.php:256` |
| 6 | **The referrer can't see progress** — no names, no stage. That removes the nudge to share again. | `ReferralEarningsCard.tsx` |
| 7 | **The message gives no reason to trust it.** No name on the landing page, a generic preview, and "rates are unmatchable" reads like an ad. | `referral.ts:285` |
| 8 | **The referral field is polluted.** The register route copies `notes` into `referral`, so 540 staged rows have something there but only 1 is a real code. That makes the data useless for measuring. | live `pending_signups` count |
| 9 | **The self-referral check can never fire**, because a brand-new user has no code yet, so the IDs never match. There is no phone, address or email lookalike check anywhere. | `verify.php:91`; admin has none |
| 10 | **The wording disagrees across places:** | |
| | • the Play listing says the credit comes "when someone you refer ships their first package"; | `play/PLAY-SUBMISSION.md:310` |
| | • `.env.example` still says "The referred friend receives no credit"; | `.env.example:43` |
| | • a code comment says the welcome credit is "credited at SIGNUP" (it is actually created when the first invoice is issued); | `referral.ts:103` |
| | • the website's BUILD_LOG says the credit comes on Miami arrival. | website `BUILD_LOG.md:248` |
| | The live pages and the bot correctly say "when their first package is delivered". | |

---

## 3. Options compared

Tap counts assume the referrer is already in the app, and the friend is on their phone with WhatsApp.

| | **A. Web-first** | **B. Bot-first** | **C. Bot, then link** | **D. Invite page + WhatsApp option (recommended)** |
|---|---|---|---|---|
| **Referrer: steps** | Share → pick contact → Send (3 taps) | Same (3 taps) | Same (3 taps) | Same (3 taps). Also QR code and "more apps" |
| **Friend: steps** | Tap link → form (6 fields + tick-box) → Submit → email → tap link | Tap link → tap **Send** on draft → type name/email/mobile → type ID + address → confirm → email → tap link → choose password ×2 | Tap link → Send → bot replies with link → tap → form (phone + code pre-filled) → email → tap link | Tap link → the page *is* the form, with invite banner and code pre-filled → Submit → email → tap link. **Or** tap "Chat on WhatsApp" → path B with the code captured by rule |
| **Keeps the code?** | High, once a cookie is added (today it's lost on return) | **Low–medium**: the draft can be edited, the AI has to pass it on, memory resets after 30 min | Medium: needs the bot to capture it by rule, then the link carries it | **High** on the web path; medium-high on the chat path once n8n captures the code by rule |
| **Spam / fake signups** | Low: honeypot, IP limit, email check | Low–medium: the agent path skips the IP limit and the bot accepts any answer word for word. A WhatsApp number helps a bit | Low (ends on the web form) | Low: same as A. Chat path same as B |
| **WhatsApp cost** | None | About 10–20 bot replies per signup. Charged from 1 Oct at the service rate (~US$0.0077, "Other" market, reseller-reported) after a reported 1,000 free a month. Reminders after 24h need paid templates | Fewer replies than B | None on the web path; chat path as B |
| **Build size** | S–M | L | M | **M** (A + banner + a small n8n change) |
| **Fits email-check-before-account?** | Yes, unchanged | Yes, but adds the set-password step | Yes | Yes, unchanged |
| **Measuring it** | Page views → staged → verified | Chat starts containing a code → register calls → verified | Both | Both, split by path |

**Evidence on web against WhatsApp in general is thin.**
- The best-known number ("94% higher conversion" for click-to-WhatsApp) comes from a Forrester study paid for by Meta, and I couldn't find the original [7].
- The other success stories are vendor-funded (Gupshup, Charles [8][9]) or Meta's own (Banco Mercantil [6]).
- I found no independent A/B test of wa.me bot signup against a web form in Latin America, Africa or the Caribbean.
- The strongest real evidence we have is our own: web signups completed 63 of 69 in September; bot signups completed 1 of 5 ever.
- What the benchmarks do agree on is that private chat apps carry most referral shares (69% chat and email, ReferralCandy 2026 [12]). So the *share* should be WhatsApp-first even if the *signup* is a web page.

---

## 4. The recommended flow, step by step (Option D)

**1. The referrer, in the app.**
- The card says *Give TT$50, get TT$100* and has three buttons:
  - **Share on WhatsApp** (main button, as now);
  - **More ways to share** (the phone's own share sheet, `navigator.share`);
  - **Show QR code**, for in person.
- **Copy link** copies the whole message, not just the code.
- The message is:

```
I use Swiftbox to get my online shopping from the US to T&T 📦 Sign up with my link and you'll get TT$50 credit toward your first Swiftbox invoice.
https://swiftboxtt.com/r/K7M2QX
```

- It says "toward your first invoice" because the credit waits for an invoice of TT$50 or more.
- It has no prices or rates, and no name, because it is sent from the referrer's own phone.
- The link sits on its own line at the end. WhatsApp previews the first link and shows the card above the text anyway [27][28].

**2. The friend sees a clean preview card in WhatsApp.**
- Title: "You've been invited to Swiftbox". Description: "Get your free Miami address and TT$50 toward your first invoice."
- The image is 1200×630 and under about 300 KB.
- The card deliberately **does not show the referrer's name**. WhatsApp caches previews, and a name there would travel with any forward.

**3. The friend taps the link.** `swiftboxtt.com/r/K7M2QX` opens the **signup page itself**, with a banner on top: *"Kezia invited you — TT$50 toward your first Swiftbox invoice."* Behind the scenes:
- The page looks the code up on the server. It shows the first name only, and nothing if the code is unknown, in which case it is a normal signup page.
- It saves the code in a first-party cookie for 60 days.
- It fills in and opens the "Referral code" field.
- It is marked `noindex`.
- Old `/signup?ref=` links keep working exactly as today.

**4a. Web path (the main one).** The friend fills the same form, submits, gets the same email and taps confirm. `verify.php` links the referral exactly as it does today. Honeypot, IP limit and verify-before-insert are all unchanged.

**4b. Chat path (for people who want to ask questions first).**
1. The button **Questions? Chat with us on WhatsApp** opens `wa.me/18686093000` with the draft "Hi Swiftbox! I was invited by a friend. Ref: K7M2QX".
2. In n8n, a small **new rule-based step** reads `Ref: XXXXXX` from the incoming text and saves it against the WhatsApp number (a small Supabase table), so it no longer depends on the AI.
3. The bot answers questions. When the friend is ready it offers both options: *"I can set you up right here, or tap your invite link to do it yourself"*.
4. If they sign up in chat, "Handle Tool Code" fills in `referral` from the saved row when the AI left it blank, and sends the WhatsApp number as the phone number. The read-back no longer asks for a code it already has.
5. If the friend deleted the code from the draft, the bot asks once: "Did someone refer you? If you have their code, send it."

**5. Returning later.** If the friend comes back to swiftboxtt.com within 60 days without the link, the signup page reads the cookie and the code is still filled in.

**6. The referrer's "Your referrals" list** in the app shows each friend by first name and last initial, with one of three stages:
- **Signed up**;
- **First package on its way**;
- **Delivered — TT$100 earned**.

**7. The credits stay exactly as they are.**
- TT$50 comes off the friend's first invoice (at issue).
- TT$100 is paid to the referrer when the friend's first package is delivered.
- New in this plan: lookalike referrals are flagged for the office (see Block 6).
- **No WhatsApp messages go out after 24 hours.** Any "your credit is ready" notice goes by email or the app, so no paid templates are needed.

---

## 5. Build plan (small blocks, in order; nothing built yet)

Each block is shippable on its own. Blocks 1–2 fix most of the leaks; the rest improve and measure.

| Block | Repo / place | What | Size |
|---|---|---|---|
| **1. Invite link + remembered code** | Website | New `src/app/r/[code]/page.tsx`: the signup form plus an invite banner, generic OG tags, `noindex`. Cookie `sb_ref` for 60 days (set in middleware or on page load). `signup/page.tsx` fills the code from the URL, or the cookie if the URL has none. New tiny PHP endpoint, e.g. `livetrack-api/referral-code.php`, that checks a code and returns `{valid, firstName}` only. It uses the same PDO path as `register.php`, **not** the bridge, so the website doesn't add another caller that uses the static bridge secret. Stop copying `notes` into `referral` in `api/auth/register/route.ts`. A lighter OG image variant (1200×630, under 300 KB). | M |
| **2. Easier sharing** | App | `referral.ts`: new message copy, link becomes `swiftboxtt.com/r/CODE`, update the vitest rule (still website-only). `ReferralCard.tsx`: WhatsApp button stays; add a `navigator.share` button with WhatsApp as fallback; Copy copies the message and link; add a QR code of the link (drawn on the page, no outside service). | S |
| **3. "Your referrals" list** | App | Read `referrals` joined to `users` (first name + last initial) plus each friend's furthest package stage. Show the three stages. First name and initial only. | S–M |
| **4. WhatsApp path captures the code** | n8n WhatsApp workflow `lUAFP52ykih4E1qM`, **with Brent's approval of the diff** | New Code node after Record Inbound: regex `Ref:\s*([A-HJKMNP-Z2-9]{6})` saves (phone, code) to a new Supabase table. **Supabase migration, run in its SQL editor.** "Handle Tool Code": if `args.referral` is empty, read it from that table; send the WhatsApp number as `phone` when the AI's is blank. "Build AI Request": one paragraph for invited friends (thank them, mention the TT$50, offer the invite link or in-chat signup, don't ask for the code again). Nothing that fails here may stop a reply (fail open, like the handoff gate). | S–M |
| **5. Tracking the funnel** | MySQL migration (next free number at build time) + app + website + admin | Table `swiftbox_referral_events` (InnoDB, **VARCHAR** event names, not ENUM, because live MySQL isn't strict), recording `share_tap`, `invite_view`, `signup_click`, `whatsapp_click`. App writes through its API; website writes through the Block 1 PHP endpoint. Owner-only funnel panel on `/admin/marketing` (any new route needs its `lib/authz.ts` line). SQL for Brent in one block, no `information_schema`. | M |
| **6. Lookalike check** | Website `verify.php` + admin `lib/referrals.ts` | Replace the self-check that can never fire with a real one: flag when the friend's phone digits, street + town, or email name matches the referrer's. Still link the referral, but mark it for review; what happens next depends on Brent's answer to question 2. | S |
| **7. Wording cleanup** | App, website | Play listing "ships" → "is delivered"; `.env.example`; the "credited at SIGNUP" comment; the website BUILD_LOG line about Miami arrival. | S |
| **8. (Optional) Ask at happy moments** | App | A "Know someone who shops online?" card when a package shows **Delivered**, plus one line in the package-received email footer. | S |

---

## 6. Funnel to track

| Stage | How it's counted | Today (2026-09-30) |
|---|---|---|
| Codes issued | `referral_codes` rows | 97 |
| **Shared** | `share_tap` events per code (Block 5) | not tracked |
| **Clicked** | unique `invite_view` per code (cookie), plus WhatsApp chats that opened with a `Ref:` (Block 4 table) | not tracked |
| **Started** | `pending_signups` whose `referral` **matches a real code** (join `referral_codes`), distinct email; split web / WhatsApp by `requires_password_set` | 1 real match (the other 539 "referral" values are junk from `notes`) |
| **Verified** | `referrals` rows | 1 (pending) |
| **First package in Miami** | a `mod_packages` row for the referred user | — |
| **First package delivered** | `referrals.status = 'qualified'` / `referral_credits` kind `referrer` | 0 |
| **Welcome credit used** | `referral_credits` kind `welcome`, `applied = 1` | 0 |

The rates to watch are shared ÷ active customers, clicked ÷ shared, verified ÷ clicked (web against WhatsApp), and delivered ÷ verified.

---

## 7. Questions only Brent can answer

1. **Can the invite page show the referrer's first name** ("Kezia invited you")? It builds trust, but anyone holding the link can see that first name. My suggestion is first name only, never in the link preview.
2. **When a referral looks like the same person** (same phone, address or email name as the referrer), should the TT$100 be **held for your review**, or **paid and just flagged**? And do you want a cap on how many credits one person can earn? None exists today; Revolut, for example, caps at 5 [35]. My suggestion is to hold for review and not cap.

(I checked the WhatsApp number myself, so it isn't a question. The live bot, the website and the app all use (868) 609-3000; the 703-3600 in the brief is out of date.)

---

## 8. Sources

**Code and data (checked 2026-09-30):**
- App `origin/master` (1710621): `src/lib/referral.ts`, `src/app/dashboard/ReferralCard.tsx`, `ReferralEarningsCard.tsx`, `next.config.ts`.
- Website `main` (d67a707): `src/app/signup/page.tsx`, `src/app/api/auth/register/route.ts`, `livetrack-api/register.php`, `verify.php`, `src/lib/signupAttribution.ts`, `src/app/referral/page.tsx`.
- Admin `origin/master`: `lib/referrals.ts`, `db/migrations/005`, `012`, `013`, `027`.
- Live n8n workflow `lUAFP52ykih4E1qM` (read-only GET, version `b1ec2053…`).
- Read-only counts from live MySQL (`referral_codes`, `referrals`, `referral_credits`, `pending_signups`) and Supabase (`swiftbox_wa_messages`).

**Web:**
1. Meta — Non-template (service) message pricing, "Effective October 1, 2026, Meta will charge for service messages"; free-entry-point exemption. https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/non-template-messages
2. respond.io — WhatsApp pricing change 2026 (1,000 free service messages/month, reseller-reported). https://respond.io/blog/whatsapp-pricing-change-2026
3. YCloud — pricing update effective Oct 1 2026. https://www.ycloud.com/blog/whatsapp-api-message-pricing-update-effective-october-1-2026
4. Techweez — service messages charged above 1,000. https://techweez.com/2026/09/28/whatsapp-business-pricing-october-2026/
5. Meta — Pricing on the WhatsApp Business Platform (market mapping; unlisted countries = "Other"). https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing
6. WhatsApp Business — Banco Mercantil success story. https://whatsappbusiness.com/resources/success-stories/banco-mercantil/
7. eGrow — WhatsApp commerce statistics (source of the "94%" figure; primary study not found). https://www.egrow.com/en/blog/whatsapp-commerce-statistics-2026-the-numbers-every-e-commerce-owner-should-know
8. Gupshup TEI (vendor-commissioned). https://www.prnewswire.com/news-releases/gupshup-conversation-cloud-and-whatsapp-drove-270-roi-for-customers-according-to-total-economic-impact-findings-302428708.html
9. Forrester TEI of Charles (vendor-commissioned). https://tei.forrester.com/go/charles/charlestei/docs/The_Total_Economic_Impact_of_Charles.pdf
12. ReferralCandy — 2026 referral benchmarks (500 stores; chat + email = 69.2% of shares). https://www.referralcandy.com/blog/referral-program-benchmarks-whats-a-good-conversion-rate-in-2025/
13. GrowSurf — referral statistics (double-sided rewards, secondhand). https://growsurf.com/statistics/referral-marketing-statistics/
14. Schmitt, Skiera & Van den Bulte (2011), *Journal of Marketing* — referred customers are worth more. https://faculty.wharton.upenn.edu/wp-content/uploads/2012/04/Schmitt-Skiera-vandenBulte-2011-Referral-Programs-Customer-Value.pdf
15. WhatsApp Help Center — How to use click to chat. https://faq.whatsapp.com/5913398998672934
16. BusinessChat — building a wa.me URL (pre-filled text appears in the text field). https://help.businesschat.io/en/articles/6517838-how-to-build-a-whatsapp-click-to-chat-url-wa-me
17. Twilio — click-to-WhatsApp referral / ctwa_clid only on ad-originated messages. https://www.twilio.com/en-us/changelog/new--click-id--callback-parameter-for-inbound-whatsapp-messages-
19. Meta — m.me links with `ref` (Messenger has one; WhatsApp does not). https://developers.facebook.com/docs/messenger-platform/discovery/m-me-links
20. Meta — WhatsApp QR codes and short links (140-char prefill, 2,000 per number, no analytics). https://developers.facebook.com/docs/whatsapp/business-management-api/qr-codes
21. Alibaba Cloud — WhatsApp country/market table. https://www.alibabacloud.com/help/en/chatapp/product-overview/whatsapp-message-conversation-fee-country-correspondence-table
22. EngageLab — 2026 pricing and the Oct 1 changes ("Other" market rates, reseller-reported). https://www.engagelab.com/blog/whatsapp-business-api-pricing
23. ChatMaxima — service message pricing Oct 2026. https://chatmaxima.com/blog/whatsapp-service-message-pricing-october-2026/
25. WhatsApp Business — platform pricing. https://whatsappbusiness.com/products/platform-pricing/
27. Meta — Cloud API messages reference (first URL previewed, `preview_url`). https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages/
28. Ogrilla — WhatsApp link preview guide (OG tags, 1200×630, size, caching; third-party testing). https://www.ogrilla.com/blog/whatsapp-link-preview-guide
29. OpenGraph.to — OG image too large. https://www.opengraph.to/articles/og-image-too-large
30. Meta — WhatsApp Flows components (email/phone field types, validation). https://developers.facebook.com/docs/whatsapp/flows/reference/components
33. TinyCommand — conversational vs traditional forms (vendor data). https://tinycommand.com/blogs/conversational-forms-vs-traditional-forms-which-is-better-for-your-business
35. Revolut — Refer a friend terms (qualifying purchases, cap of 5). https://www.revolut.com/en-PL/legal/Refer-a-friend-promotion-witha-Bonus/
36. Referral Rock — Dropbox referral program (secondary source). https://referralrock.com/blog/dropbox-referral-program/
37. Fingerprint — referral fraud prevention. https://fingerprint.com/blog/what-is-referral-fraud-prevention-tips/
38. Sardine — referral fraud. https://www.sardine.ai/fraud-aml-glossary/referral-fraud
41. Thomas et al. (Google) — Dialing Back Abuse on Phone Verified Accounts (phone numbers are only a moderate identity signal). https://research.google/pubs/dialing-back-abuse-on-phone-verified-accounts/

**Caveats.**
- Source numbering follows the research notes, so gaps in the list are sources that were read but not cited.
- **Rates:** the "Other" market rates and the 1,000-message free allowance come from resellers. Meta's page confirms the 1 October charging and that service messages are billed at the utility rate, but I didn't see the allowance there.
- **Link previews:** Meta publishes no WhatsApp link-preview spec beyond "first URL", so the preview sizing guidance comes from third-party testing.
