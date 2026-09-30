"use client";

import { TWA_REFERRER_PREFIX } from "@/lib/install-env";

/**
 * "Install the app" — the half that reads the browser. Every accessor is
 * wrapped: private mode and locked-down webviews can throw on storage, and
 * old iOS has no display-mode media query at all.
 */

const TWA_SESSION_FLAG = "sb_twa";

/**
 * A Trusted Web Activity only announces itself on its FIRST page, through
 * `document.referrer`. Remember it for the rest of the session so later pages
 * (after a full reload, say) still know they are inside the Play app.
 */
export function rememberTwaLaunch(): void {
  try {
    if (document.referrer.startsWith(TWA_REFERRER_PREFIX)) {
      sessionStorage.setItem(TWA_SESSION_FLAG, "1");
    }
  } catch {
    /* storage blocked — the referrer check below still covers the first page */
  }
}

function inTwa(): boolean {
  if (document.referrer.startsWith(TWA_REFERRER_PREFIX)) return true;
  try {
    return sessionStorage.getItem(TWA_SESSION_FLAG) === "1";
  } catch {
    return false;
  }
}

function displayModeIs(mode: string): boolean {
  try {
    return window.matchMedia(`(display-mode: ${mode})`).matches;
  } catch {
    return false;
  }
}

/**
 * True when Swiftbox is running as an installed app: from the home screen on
 * iPhone or Android, or inside the Play Store app. Only positive signals are
 * trusted — "not display-mode: browser" would call an old iPhone installed.
 */
export function isInstalledContext(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return (
    nav.standalone === true ||
    displayModeIs("standalone") ||
    displayModeIs("fullscreen") ||
    displayModeIs("minimal-ui") ||
    displayModeIs("window-controls-overlay") ||
    inTwa()
  );
}

export function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* blocked storage just means the bar comes back next visit */
  }
}
