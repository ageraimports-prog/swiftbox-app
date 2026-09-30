import fs from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import AuthLayout from "@/components/AuthLayout";
import InstallGuide, { type InstallVideo, type InstallVideos } from "./InstallGuide";

/**
 * /install — "Get the Swiftbox app". PUBLIC: the middleware only guards
 * /dashboard and /account, so no sign-in is needed. swiftboxtt.com/app
 * redirects here.
 *
 * It has to live on THIS origin: iPhone's Add to Home Screen saves the site
 * that is open, so the steps are only useful shown on app.swiftboxtt.com.
 * The home-screen icon still opens the app's normal entry, not this page —
 * the manifest's start_url is "/" (which routes to login or the dashboard)
 * and current iOS launches web clips at start_url, as Android does.
 *
 * Screen recordings: drop `iphone.mp4` / `android.mp4` (and optionally
 * `iphone-poster.jpg` / `android-poster.jpg`) into public/install/ and
 * redeploy. The check runs at BUILD time, so a missing file renders nothing
 * — never a broken player.
 *
 * The QR code (public/install/qr-swiftboxtt-app.svg) encodes
 * https://swiftboxtt.com/app. It was generated locally with the `qrcode` npm
 * package (error correction M, margin 2, #0e1114 on white); regenerate the
 * same way if the short link ever changes.
 */

export const dynamic = "force-static";

export const metadata: Metadata = {
  metadataBase: new URL("https://app.swiftboxtt.com"),
  title: "Get the Swiftbox app",
  description:
    "Add Swiftbox to your phone's home screen and track your Miami-to-Trinidad packages in one tap. Free, and no app store needed.",
  alternates: { canonical: "/install" },
  openGraph: {
    title: "Get the Swiftbox app",
    description: "Track your packages from your home screen. Takes less than a minute.",
    url: "/install",
    siteName: "Swiftbox",
    images: [{ url: "/icons/icon-512.png", width: 512, height: 512, alt: "Swiftbox" }],
  },
};

function findVideo(name: "iphone" | "android"): InstallVideo | null {
  const dir = path.join(process.cwd(), "public", "install");
  const has = (file: string) => {
    try {
      return fs.statSync(path.join(dir, file)).size > 0;
    } catch {
      return false;
    }
  };
  if (!has(`${name}.mp4`)) return null;
  return {
    src: `/install/${name}.mp4`,
    poster: has(`${name}-poster.jpg`) ? `/install/${name}-poster.jpg` : null,
  };
}

/*
 * Chrome can fire `beforeinstallprompt` before React has hydrated, and it
 * does not fire it twice. This catches it at parse time and parks it on
 * window for InstallGuide to pick up.
 */
const EARLY_INSTALL_CAPTURE = `window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();window.__sbBip=e;});window.addEventListener("appinstalled",function(){window.__sbInstalled=true;});`;

export default function InstallPage() {
  const videos: InstallVideos = { iphone: findVideo("iphone"), android: findVideo("android") };

  return (
    <AuthLayout>
      <script dangerouslySetInnerHTML={{ __html: EARLY_INSTALL_CAPTURE }} />
      <InstallGuide videos={videos} />
    </AuthLayout>
  );
}
