import { NextResponse } from "next/server";

/**
 * Digital Asset Links statement, served at /.well-known/assetlinks.json via the
 * rewrite in next.config.ts.
 *
 * This is what makes the Android app a *Trusted* Web Activity: Chrome fetches
 * this file on launch and, if the signing fingerprint matches, hides the
 * browser address bar. Get it wrong and the app still runs but looks like a
 * browser window — which Play reviewers reject as "a webview wrapper".
 *
 * THE FINGERPRINT MUST BE THE ONE FROM PLAY APP SIGNING, NOT YOUR LOCAL
 * KEYSTORE. Google re-signs every upload with its own key.
 *   Play Console → your app → Test and release → Setup → App signing
 *   → "App signing key certificate" → copy the SHA-256 fingerprint.
 *
 * List BOTH fingerprints while testing: the Play app signing key (installs from
 * Play) and your local upload key (APKs you sideload to test). Extra entries
 * are harmless.
 */

const PACKAGE_NAME = process.env.ANDROID_PACKAGE_NAME ?? "com.swiftboxtt.app";

// Colon-separated SHA-256 fingerprints, comma-separated if more than one.
// Either set ANDROID_SHA256_FINGERPRINTS in Vercel, or paste them here.
const FINGERPRINTS = (
  process.env.ANDROID_SHA256_FINGERPRINTS ??
  "REPLACE_WITH_PLAY_APP_SIGNING_SHA256"
)
  .split(",")
  .map((f) => f.trim().toUpperCase())
  .filter(Boolean);

export const dynamic = "force-static";

export function GET() {
  const statements = [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: PACKAGE_NAME,
        sha256_cert_fingerprints: FINGERPRINTS,
      },
    },
  ];

  return NextResponse.json(statements, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300",
    },
  });
}
