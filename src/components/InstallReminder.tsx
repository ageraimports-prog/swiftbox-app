"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  detectInstallEnv,
  isReminderSnoozed,
  REMINDER_DISMISS_KEY,
} from "@/lib/install-env";
import { isInstalledContext, readStorage, writeStorage } from "@/lib/install-client";

/** Set on <html> while the bar shows, so the page and floating buttons make room. */
const HEIGHT_VAR = "--sb-reminder-h";

/**
 * "Add Swiftbox to your home screen" — a slim bar that sits directly ABOVE the
 * tab bar (it renders inside TabBar's <nav>, so it can never cover a tab).
 *
 * Shown only to a signed-in customer on a phone, in an ordinary browser tab.
 * Hidden when installed (home screen or the Play app), on /install itself, and
 * for 14 days after the X. While it shows, its height is published as
 * --sb-reminder-h: the dashboard's bottom padding and the pre-alerts "+"
 * button both add it, so nothing ends up underneath.
 */
export default function InstallReminder() {
  const pathname = usePathname();
  const [show, setShow] = React.useState(false);
  const barRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const env = detectInstallEnv(navigator.userAgent, navigator.maxTouchPoints ?? 0);
    setShow(
      env.os !== "desktop" &&
        !isInstalledContext() &&
        !isReminderSnoozed(readStorage(REMINDER_DISMISS_KEY), Date.now())
    );
  }, []);

  const visible = show && !pathname.startsWith("/install");

  React.useLayoutEffect(() => {
    const root = document.documentElement;
    const el = barRef.current;
    if (!visible || !el) {
      root.style.removeProperty(HEIGHT_VAR);
      return;
    }
    const publish = () => root.style.setProperty(HEIGHT_VAR, `${el.offsetHeight}px`);
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty(HEIGHT_VAR);
    };
  }, [visible]);

  if (!visible) return null;

  function dismiss() {
    writeStorage(REMINDER_DISMISS_KEY, String(Date.now()));
    setShow(false);
  }

  return (
    <div
      ref={barRef}
      role="region"
      aria-label="Install the app"
      data-install-reminder
      className="border-b border-mist/10 bg-ink"
    >
      <div className="mx-auto flex max-w-md items-center gap-2 py-1.5 pr-1 pl-4">
        <p className="min-w-0 flex-1 text-[13px] leading-snug font-medium text-mist">
          Add Swiftbox to your home screen for faster tracking
        </p>
        <Link
          href="/install"
          className="shrink-0 rounded-full bg-green px-3.5 py-2 text-[13px] font-bold whitespace-nowrap text-ink transition-colors hover:bg-green-deep"
        >
          Show me how
        </Link>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss for now"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-dark transition-colors hover:text-mist"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5" aria-hidden>
            <path strokeLinecap="round" d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
