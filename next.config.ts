import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      // Digital Asset Links — proves app.swiftboxtt.com and the Play app are
      // the same owner. Without this the TWA falls back to a Chrome address
      // bar. Next does not reliably serve dot-directories from /public, so the
      // canonical path is rewritten to a route handler.
      {
        source: "/.well-known/assetlinks.json",
        destination: "/api/assetlinks",
      },
    ];
  },

  async redirects() {
    return [
      // Registration lives ONLY on the marketing site. The app has no /signup
      // page and never has, so anything asking this origin for one is a stale
      // share link sitting in somebody's WhatsApp history — bounce it to the
      // real page instead of serving a 404 to a prospective customer.
      //
      // Next preserves the incoming query string on a redirect, so ?ref=CODE
      // survives the hop and the marketing signup page still prefills the
      // referral field.
      {
        source: "/signup",
        destination: "https://swiftboxtt.com/signup",
        permanent: true,
      },
      // Same for anything nested under it. The destination deliberately drops
      // the subpath (Next appends the unused :path* as a ?path= query param,
      // which the signup page ignores) — landing on the page that actually
      // works beats forwarding a subpath the website may not have.
      {
        source: "/signup/:path*",
        destination: "https://swiftboxtt.com/signup",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
