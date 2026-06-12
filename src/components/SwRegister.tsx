"use client";

import { useEffect } from "react";

/** Registers the service worker (production only — caching gets in the way of dev). */
export default function SwRegister() {
  useEffect(() => {
    if (
      process.env.NODE_ENV === "production" &&
      "serviceWorker" in navigator
    ) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* registration failure is non-fatal */
      });
    }
  }, []);
  return null;
}
