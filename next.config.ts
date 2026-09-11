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
};

export default nextConfig;
