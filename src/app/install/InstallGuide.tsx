"use client";

import * as React from "react";
import Link from "next/link";
import {
  chromeIntentUrl,
  detectInstallEnv,
  PLAY_STORE_URL,
  SHORT_INSTALL_URL,
  type InstallEnv,
} from "@/lib/install-env";
import { isInstalledContext } from "@/lib/install-client";
import {
  AddToHomeIcon,
  CheckIcon,
  CompassIcon,
  CopyIcon,
  InstallPhoneIcon,
  IosShareIcon,
  KebabIcon,
  MockAddressBar,
  MockAndroidInstallDialog,
  MockIosAddSheet,
  MockMenu,
  MockSafariToolbar,
  MockScreen,
  MoreDotsIcon,
} from "./illustrations";

export type InstallVideo = { src: string; poster: string | null };
export type InstallVideos = { iphone: InstallVideo | null; android: InstallVideo | null };

/** Chrome's install event. Not in TypeScript's DOM lib. */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

declare global {
  interface Window {
    /** Caught by the inline script in page.tsx, in case it fires before hydration. */
    __sbBip?: BeforeInstallPromptEvent;
    __sbInstalled?: boolean;
  }
}

type Panel = "installed" | "in-app" | "android" | "ios" | "desktop";
type OtherPhone = "ios" | "android";

/** Which ONE panel this visitor needs. */
function panelFor(env: InstallEnv, installed: boolean): Panel {
  if (installed) return "installed";
  if (env.inApp) return "in-app";
  if (env.os === "android") return "android";
  if (env.os === "ios") return "ios";
  return "desktop";
}

export default function InstallGuide({ videos }: { videos: InstallVideos }) {
  // Nothing is known on the server — detection runs after mount, and until
  // then a same-height placeholder keeps the page from jumping.
  const [env, setEnv] = React.useState<InstallEnv | null>(null);
  const [installed, setInstalled] = React.useState(false);
  const [other, setOther] = React.useState<OtherPhone | null>(null);

  React.useEffect(() => {
    setEnv(detectInstallEnv(navigator.userAgent, navigator.maxTouchPoints ?? 0));
    setInstalled(isInstalledContext());
  }, []);

  const detected = env ? panelFor(env, installed) : null;
  const panel: Panel | null = other ?? detected;

  return (
    <div>
      <h1 className="sb-disp text-center text-3xl leading-tight text-mist">
        Get the Swiftbox app
      </h1>
      <p className="mx-auto mt-3 max-w-sm text-center text-base text-muted-dark">
        Track your packages straight from your home screen. It&apos;s free and
        takes less than a minute.
      </p>

      <div className="mt-8" data-panel={panel ?? "loading"}>
        {!env && <div className="h-80 animate-pulse rounded-xl bg-ink-2" aria-hidden />}
        {env && panel === "installed" && <InstalledPanel />}
        {env && panel === "in-app" && <InAppPanel env={env} />}
        {env && panel === "android" && (
          <AndroidPanel
            realAndroid={env.os === "android" && !env.inApp && !installed}
            video={videos.android}
          />
        )}
        {env && panel === "ios" && <IosPanel env={env} forced={other === "ios"} video={videos.iphone} />}
        {env && panel === "desktop" && <DesktopPanel />}
      </div>

      {env && (
        <OtherPhoneToggle
          value={other}
          onChange={(v) => {
            setOther(v);
            if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      )}

      <p className="mt-8 text-center text-sm text-muted-dark">
        Rather use it in your browser?{" "}
        <Link href="/login" className="font-semibold text-mist underline decoration-green/60 underline-offset-4">
          Sign in here
        </Link>
      </p>
    </div>
  );
}

/* ── Building blocks ─────────────────────────────────────────────────────── */

const primaryBtn =
  "flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-green px-5 py-4 text-lg font-bold text-ink shadow-lg shadow-green/20 transition-colors hover:bg-green-deep active:bg-green-deep";
const secondaryBtn =
  "flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-mist/20 px-5 py-3 text-base font-semibold text-mist transition-colors hover:border-green hover:text-green";

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-mist/10 bg-ink-2 p-5 ${className}`}>{children}</section>;
}

function Step({
  n,
  title,
  children,
  mock,
}: {
  n: number;
  title: React.ReactNode;
  children?: React.ReactNode;
  mock?: React.ReactNode;
}) {
  return (
    <li className="rounded-2xl border border-mist/10 bg-ink-2 p-5">
      <div className="flex items-start gap-4">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green text-lg font-extrabold text-ink"
          aria-hidden
        >
          {n}
        </span>
        <div className="min-w-0 pt-1">
          <h3 className="text-lg font-bold leading-snug text-mist">
            <span className="sr-only">Step {n}: </span>
            {title}
          </h3>
          {children && <div className="mt-1.5 text-[15px] leading-relaxed text-muted-dark">{children}</div>}
        </div>
      </div>
      {mock && <MockScreen>{mock}</MockScreen>}
    </li>
  );
}

/** "Copy link" with a "Copied" confirmation — the fallback when no button can open a browser. */
function CopyLinkButton({ label = "Copy link" }: { label?: string }) {
  const [copied, setCopied] = React.useState(false);

  async function copy() {
    const href = window.location.href;
    let ok = false;
    try {
      await navigator.clipboard.writeText(href);
      ok = true;
    } catch {
      // In-app webviews often refuse the async clipboard; the old way still works.
      const ta = document.createElement("textarea");
      ta.value = href;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        ok = document.execCommand("copy");
      } catch {
        ok = false;
      }
      document.body.removeChild(ta);
    }
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } else {
      window.prompt("Copy this link:", href);
    }
  }

  return (
    <button type="button" onClick={copy} className={secondaryBtn} aria-live="polite">
      {copied ? (
        <>
          <CheckIcon className="h-5 w-5 text-green" />
          <span className="text-green">Copied</span>
        </>
      ) : (
        <>
          <CopyIcon />
          {label}
        </>
      )}
    </button>
  );
}

/** A screen recording, only when the file was found at build time. */
function StepsVideo({ video, label }: { video: InstallVideo | null; label: string }) {
  if (!video) return null;
  return (
    <figure className="mt-6">
      <video
        // Portrait phone recordings (iphone.mp4 is 576x1280): sized by a capped
        // height so a full-width player can't be ~700px tall on a 360px phone.
        className="mx-auto block aspect-[9/20] h-[min(65vh,520px)] w-auto max-w-full rounded-2xl border border-mist/10 bg-black"
        // #t=0.1 makes iOS paint the first frame when there's no poster image.
        src={video.poster ? video.src : `${video.src}#t=0.1`}
        poster={video.poster ?? undefined}
        muted
        playsInline
        controls
        preload="metadata"
        aria-label={label}
      />
      <figcaption className="mt-2 text-center text-sm text-muted-dark">{label}</figcaption>
    </figure>
  );
}

/* ── a) Already installed ────────────────────────────────────────────────── */

function InstalledPanel() {
  return (
    <Card className="text-center">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green/15 text-green">
        <CheckIcon className="h-8 w-8" />
      </span>
      <h2 className="sb-disp mt-4 text-2xl text-mist">You already have the app</h2>
      <p className="mt-2 text-base text-muted-dark">
        You&apos;re using Swiftbox from your home screen — you&apos;re all set.
      </p>
      <Link href="/" className={`${primaryBtn} mt-6`}>
        Open Swiftbox
      </Link>
    </Card>
  );
}

/* ── b) Inside Instagram / Facebook / WhatsApp / TikTok … ────────────────── */

function InAppPanel({ env }: { env: InstallEnv }) {
  const app = env.inApp ?? "this app";
  const onIphone = env.os === "ios";
  const browser = onIphone ? "Safari" : "Chrome";
  const [intent, setIntent] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!onIphone) setIntent(chromeIntentUrl(window.location.href));
  }, [onIphone]);

  return (
    <div>
      <Card className="border-green/40">
        <p className="text-sm font-bold uppercase tracking-wider text-green">First step</p>
        <h2 className="sb-disp mt-1 text-2xl leading-tight text-mist">
          Open this page in {onIphone ? "Safari" : "your browser"} to install
        </h2>
        <p className="mt-2 text-base text-muted-dark">
          You&apos;re looking at this inside {app}. {app} can&apos;t add apps to your home
          screen, but {browser} can.
        </p>
        {!onIphone && intent && (
          <a href={intent} className={`${primaryBtn} mt-5`}>
            Open in Chrome
          </a>
        )}
      </Card>

      <ol className="mt-4 space-y-4">
        {onIphone ? (
          <>
            <Step
              n={1}
              title={
                <>
                  Tap <MoreDotsIcon className="inline h-5 w-5 align-[-3px]" /> or the Share icon{" "}
                  <IosShareIcon className="inline h-5 w-5 align-[-3px]" />
                </>
              }
              mock={<MockAddressBar menu="dots" />}
            >
              It&apos;s in a corner of the screen — top right or bottom right, depending on the app.
            </Step>
            <Step
              n={2}
              title={<>Tap &ldquo;Open in Safari&rdquo;</>}
              mock={
                <MockMenu
                  rows={[
                    { label: "Copy link" },
                    { label: "Open in Safari", icon: <CompassIcon className="h-5 w-5" />, highlight: true },
                  ]}
                />
              }
            >
              Some apps say &ldquo;Open in browser&rdquo; or &ldquo;Open in external browser&rdquo;
              instead — same thing.
            </Step>
            <Step n={3} title="Follow the steps that open in Safari">
              This same page opens in Safari with three quick steps.
            </Step>
          </>
        ) : (
          <>
            <Step
              n={1}
              title={
                <>
                  Or tap <KebabIcon className="inline h-5 w-5 align-[-3px]" /> at the top right
                </>
              }
              mock={<MockAddressBar menu="kebab" />}
            >
              Use this if the green button didn&apos;t open Chrome.
            </Step>
            <Step
              n={2}
              title={<>Tap &ldquo;Open in Chrome&rdquo;</>}
              mock={
                <MockMenu
                  rows={[
                    { label: "Copy link" },
                    { label: "Open in Chrome", highlight: true },
                  ]}
                />
              }
            >
              It may say &ldquo;Open in browser&rdquo; or &ldquo;Open in external browser&rdquo;.
            </Step>
          </>
        )}
      </ol>

      <div className="mt-6">
        <p className="mb-3 text-center text-[15px] text-muted-dark">
          Can&apos;t find it? Copy the link and paste it into {browser}.
        </p>
        <CopyLinkButton />
      </div>
    </div>
  );
}

/* ── c) Android: Chrome / Edge / Samsung Internet ────────────────────────── */

type AndroidState = "waiting" | "ready" | "no-prompt" | "installed";

/**
 * `realAndroid` is false when a staff member is SHOWING the Android steps on
 * another phone — then there's no install event to wait for, only the steps.
 */
function AndroidPanel({ realAndroid, video }: { realAndroid: boolean; video: InstallVideo | null }) {
  const promptRef = React.useRef<BeforeInstallPromptEvent | null>(null);
  const [state, setState] = React.useState<AndroidState>(realAndroid ? "waiting" : "no-prompt");

  React.useEffect(() => {
    if (!realAndroid) return;

    if (window.__sbInstalled) {
      setState("installed");
      return;
    }
    if (window.__sbBip) {
      promptRef.current = window.__sbBip;
      setState("ready");
    }

    const onPrompt = (e: Event) => {
      e.preventDefault(); // we show our own button instead of Chrome's mini-bar
      promptRef.current = e as BeforeInstallPromptEvent;
      setState((s) => (s === "installed" ? s : "ready"));
    };
    const onInstalled = () => setState("installed");
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    // Chrome doesn't always offer the prompt (already installed, recently
    // dismissed, Samsung/Firefox). After a few seconds, show the manual steps.
    const t = setTimeout(() => setState((s) => (s === "waiting" ? "no-prompt" : s)), 3500);

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      clearTimeout(t);
    };
  }, [realAndroid]);

  async function install() {
    const ev = promptRef.current;
    if (!ev) return setState("no-prompt");
    promptRef.current = null; // a prompt can only be shown once
    try {
      await ev.prompt();
      const { outcome } = await ev.userChoice;
      // "accepted" is enough to say so — appinstalled lands a moment later.
      setState(outcome === "accepted" ? "installed" : "no-prompt");
    } catch {
      setState("no-prompt");
    }
  }

  if (state === "installed") {
    return (
      <Card className="text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green/15 text-green">
          <CheckIcon className="h-8 w-8" />
        </span>
        <h2 className="sb-disp mt-4 text-2xl text-mist">Swiftbox is on your phone</h2>
        <p className="mt-2 text-base text-muted-dark">
          Look for the green Swiftbox icon on your home screen or in your apps list, and open it
          from there next time.
        </p>
      </Card>
    );
  }

  return (
    <div>
      {PLAY_STORE_URL && (
        <Card className="mb-4">
          <h2 className="text-lg font-bold text-mist">Get it from Google Play</h2>
          <p className="mt-1 text-[15px] text-muted-dark">The easiest way on Android.</p>
          <a href={PLAY_STORE_URL} className={`${primaryBtn} mt-4`} rel="noopener">
            Get it on Google Play
          </a>
        </Card>
      )}

      {state === "ready" && (
        <Card>
          <h2 className="text-lg font-bold text-mist">
            {PLAY_STORE_URL ? "Or install it straight from here" : "Install it in one tap"}
          </h2>
          <button type="button" onClick={install} className={`${PLAY_STORE_URL ? secondaryBtn : primaryBtn} mt-4`}>
            <InstallPhoneIcon className="h-6 w-6" />
            Install Swiftbox
          </button>
        </Card>
      )}

      {state === "waiting" && (
        <div className="h-24 animate-pulse rounded-2xl bg-ink-2" aria-label="Getting ready…" />
      )}

      {state === "no-prompt" && (
        <>
          {realAndroid && (
            <p className="mb-4 text-center text-[15px] text-muted-dark">
              {PLAY_STORE_URL ? "Or add it from your browser" : "Add it from your browser"} in three taps:
            </p>
          )}
          <ol className="space-y-4">
            <Step
              n={1}
              title={
                <>
                  Tap <KebabIcon className="inline h-5 w-5 align-[-3px]" /> at the top right
                </>
              }
              mock={<MockAddressBar menu="kebab" />}
            >
              On Samsung Internet it&apos;s <strong className="text-mist">≡</strong> at the bottom right.
            </Step>
            <Step
              n={2}
              title={<>Tap &ldquo;Install app&rdquo; or &ldquo;Add to Home screen&rdquo;</>}
              mock={
                <MockMenu
                  rows={[
                    { label: "New tab" },
                    { label: "Bookmarks" },
                    { label: "Install app", icon: <InstallPhoneIcon className="h-5 w-5" />, highlight: true },
                  ]}
                />
              }
            >
              Samsung Internet: &ldquo;Add page to&rdquo;, then &ldquo;Home screen&rdquo;. If the menu
              says &ldquo;Open app&rdquo;, you already have it.
            </Step>
            <Step n={3} title={<>Tap &ldquo;Install&rdquo;</>} mock={<MockAndroidInstallDialog />}>
              The Swiftbox icon appears on your home screen.
            </Step>
          </ol>
        </>
      )}

      <StepsVideo video={video} label="Watch it done on an Android phone" />
    </div>
  );
}

/* ── d) iPhone / iPad ────────────────────────────────────────────────────── */

function IosPanel({ env, forced, video }: { env: InstallEnv; forced: boolean; video: InstallVideo | null }) {
  // Shown only on a real iPhone in Chrome/Firefox/etc. — not when a staff
  // member is showing the iPhone steps from an Android.
  const otherBrowser = !forced && env.os === "ios" && !env.iosSafari ? env.iosBrowser ?? "this browser" : null;

  return (
    <div>
      {otherBrowser && (
        <Card className="mb-4 border-green/40">
          <p className="text-base text-mist">
            You&apos;re in <strong>{otherBrowser}</strong>. You can add Swiftbox from here too — the
            Share icon is at the top right, next to the address bar.
          </p>
          <p className="mt-2 text-[15px] text-muted-dark">
            Safari is the most reliable. If you don&apos;t see &ldquo;Add to Home Screen&rdquo;, copy
            the link and open it in Safari.
          </p>
          <div className="mt-4">
            <CopyLinkButton label="Copy link for Safari" />
          </div>
        </Card>
      )}

      <ol className="space-y-4">
        <Step
          n={1}
          title={
            <>
              Tap the Share icon <IosShareIcon className="inline h-6 w-6 align-[-4px] text-[#4da3ff]" />
            </>
          }
          mock={
            <div className="space-y-3">
              <MockSafariToolbar />
              <p className="text-center text-xs font-semibold uppercase tracking-wider text-gray-400">
                or on newer iPhones
              </p>
              <MockAddressBar menu="dots" />
            </div>
          }
        >
          It&apos;s at the bottom of the screen (top right on iPad). On newer iPhones, tap{" "}
          <strong className="text-mist">•••</strong> next to the address bar first, then Share.
        </Step>
        <Step
          n={2}
          title={<>Scroll down and tap &ldquo;Add to Home Screen&rdquo;</>}
          mock={
            <MockMenu
              rows={[
                { label: "Copy" },
                { label: "Add to Favourites" },
                { label: "Add to Home Screen", icon: <AddToHomeIcon className="h-5 w-5" />, highlight: true },
              ]}
            />
          }
        >
          It&apos;s further down the list — swipe up on the menu to find it.
        </Step>
        <Step n={3} title={<>Tap &ldquo;Add&rdquo;</>} mock={<MockIosAddSheet />}>
          It&apos;s at the top right. Swiftbox is now on your home screen — open it from there.
        </Step>
      </ol>

      <p className="mt-5 text-center text-[15px] text-muted-dark">
        No &ldquo;Add to Home Screen&rdquo;? You may be inside another app — tap{" "}
        <CompassIcon className="inline h-5 w-5 align-[-4px]" /> or &ldquo;Open in Safari&rdquo; first.
      </p>

      <StepsVideo video={video} label="Watch it done on an iPhone" />
    </div>
  );
}

/* ── e) Computer ─────────────────────────────────────────────────────────── */

function DesktopPanel() {
  return (
    <Card className="text-center">
      <h2 className="sb-disp text-2xl text-mist">Swiftbox is made for your phone</h2>
      <p className="mt-2 text-base text-muted-dark">
        Point your phone&apos;s camera at this code to get the app:
      </p>
      {/* A static file generated locally (see page.tsx) — no third-party QR service. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/install/qr-swiftboxtt-app.svg"
        alt={`QR code for ${SHORT_INSTALL_URL}`}
        width={220}
        height={220}
        className="mx-auto mt-5 h-[220px] w-[220px] rounded-xl bg-white p-2"
        data-qr
      />
      <p className="mt-4 text-base text-muted-dark">
        or type <strong className="text-mist">swiftboxtt.com/app</strong> on your phone.
      </p>
    </Card>
  );
}

/* ── "Show steps for another phone" ──────────────────────────────────────── */

function OtherPhoneToggle({
  value,
  onChange,
}: {
  value: OtherPhone | null;
  onChange: (v: OtherPhone | null) => void;
}) {
  const opts: { v: OtherPhone; label: string }[] = [
    { v: "ios", label: "iPhone" },
    { v: "android", label: "Android" },
  ];
  return (
    <div className="mt-10 border-t border-mist/10 pt-6 text-center">
      <p className="text-sm font-semibold text-muted-dark">Show steps for another phone</p>
      <div className="mx-auto mt-3 flex max-w-xs gap-2" role="group" aria-label="Show steps for another phone">
        {opts.map((o) => {
          const on = value === o.v;
          return (
            <button
              key={o.v}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? null : o.v)}
              className={`min-h-11 flex-1 rounded-lg border px-4 text-[15px] font-semibold transition-colors ${
                on ? "border-green bg-green text-ink" : "border-mist/20 text-mist hover:border-green"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {value && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="mt-3 min-h-11 text-sm font-semibold text-green underline underline-offset-4"
        >
          Back to the steps for this phone
        </button>
      )}
    </div>
  );
}
