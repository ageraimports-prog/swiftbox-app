/**
 * "Install the app" — the pure half. Everything here takes its inputs as
 * arguments (user agent, touch points, stored values, the clock) so it can be
 * unit-tested without a browser; the window-reading half is
 * `install-client.ts`.
 */

/**
 * The Google Play listing. EMPTY = the "Get it on Google Play" button is
 * hidden and Android users install from the browser instead.
 *
 * Checked 2026-09-29: https://play.google.com/store/apps/details?id=com.swiftboxtt.app
 * answers 404 (TT and US storefronts), so the listing is not public yet. Paste
 * that URL here once it opens — nothing else needs to change.
 */
export const PLAY_STORE_URL = "";

/** Android package of the Trusted Web Activity (matches api/assetlinks). */
export const ANDROID_PACKAGE = "com.swiftboxtt.app";

/** A TWA opens its first page with this as `document.referrer`. */
export const TWA_REFERRER_PREFIX = `android-app://${ANDROID_PACKAGE}`;

/** The short link printed on flyers and shared in chats. */
export const SHORT_INSTALL_URL = "https://swiftboxtt.com/app";

export type PhoneOs = "ios" | "android" | "desktop";

export type InstallEnv = {
  os: PhoneOs;
  /** Friendly name of the social app whose built-in browser this is, or null. */
  inApp: string | null;
  /** iOS only: true in Safari itself, false in Chrome/Firefox/Edge/etc. on iOS. */
  iosSafari: boolean;
  /** iOS only, when not Safari: the browser's name for the copy, e.g. "Chrome". */
  iosBrowser: string | null;
};

/*
 * In-app browsers, most specific first. These apps open links in their own
 * webview, which has no "Add to Home Screen" — the customer has to get into a
 * real browser first. Messenger identifies itself as FBAN/FBAV like Facebook,
 * so it can only be told apart by its own token.
 */
const IN_APP_BROWSERS: [RegExp, string][] = [
  [/Instagram/i, "Instagram"],
  [/\bMessenger\b|FBAN\/Messenger|MessengerForiOS|\bOrca-Android\b/i, "Messenger"],
  [/FBAN|FBAV|FB_IAB|FBIOS|FB4A/i, "Facebook"],
  [/WhatsApp/i, "WhatsApp"],
  [/musical_ly|TikTok|BytedanceWebview|trill_/i, "TikTok"],
  [/Snapchat/i, "Snapchat"],
  [/\bLine\//i, "LINE"],
  [/LinkedInApp/i, "LinkedIn"],
  [/Twitter|TwitterAndroid/i, "X"],
  [/Pinterest/i, "Pinterest"],
];

/** iOS browsers other than Safari. All use WebKit and all say "Safari" too. */
const IOS_OTHER_BROWSERS: [RegExp, string][] = [
  [/CriOS/i, "Chrome"],
  [/FxiOS/i, "Firefox"],
  [/EdgiOS/i, "Edge"],
  [/OPiOS|OPT\//i, "Opera"],
  [/DuckDuckGo/i, "DuckDuckGo"],
  [/\bGSA\//i, "the Google app"],
  [/YaBrowser/i, "Yandex"],
];

export function inAppBrowserName(ua: string): string | null {
  for (const [re, name] of IN_APP_BROWSERS) if (re.test(ua)) return name;
  return null;
}

/**
 * `maxTouchPoints` matters for iPadOS 13+, which reports a Mac user agent: a
 * "Macintosh" with a touchscreen is an iPad.
 */
export function detectInstallEnv(ua: string, maxTouchPoints = 0): InstallEnv {
  const isIos =
    /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && maxTouchPoints > 1);
  const isAndroid = !isIos && /Android/i.test(ua);
  const os: PhoneOs = isIos ? "ios" : isAndroid ? "android" : "desktop";
  const inApp = os === "desktop" ? null : inAppBrowserName(ua);

  let iosBrowser: string | null = null;
  if (isIos && !inApp) {
    for (const [re, name] of IOS_OTHER_BROWSERS) {
      if (re.test(ua)) {
        iosBrowser = name;
        break;
      }
    }
  }

  return { os, inApp, iosSafari: isIos && !inApp && !iosBrowser, iosBrowser };
}

/**
 * An Android `intent://` link that reopens `href` in Chrome — the one way out of
 * an in-app browser that doesn't need the customer to find a menu. If Chrome
 * isn't installed, Android follows the fallback URL instead.
 */
export function chromeIntentUrl(href: string): string {
  const url = new URL(href);
  return (
    `intent://${url.host}${url.pathname}${url.search}` +
    `#Intent;scheme=${url.protocol.replace(":", "")};package=com.android.chrome;` +
    `S.browser_fallback_url=${encodeURIComponent(href)};end`
  );
}

/* ── In-app reminder bar ─────────────────────────────────────────────────── */

export const REMINDER_DISMISS_KEY = "sb_install_reminder_dismissed_at";
export const REMINDER_SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * True while an X-tap is less than 14 days old. Anything unreadable — nothing
 * stored, junk, or a time in the future (a phone whose clock was wrong) —
 * counts as "not snoozed", so the worst case is the bar showing again.
 */
export function isReminderSnoozed(stored: string | null, now: number): boolean {
  if (!stored) return false;
  const at = Number(stored);
  if (!Number.isFinite(at) || at <= 0 || at > now) return false;
  return now - at < REMINDER_SNOOZE_MS;
}
