"use client";

import { useEffect } from "react";
import { rememberTwaLaunch } from "@/lib/install-client";

/**
 * The Play Store app (a Trusted Web Activity) only identifies itself on the
 * first page it opens. Rendered in the root layout so that first page — login,
 * dashboard, whatever it is — records it for the rest of the session.
 */
export default function TwaMarker() {
  useEffect(() => {
    rememberTwaLaunch();
  }, []);
  return null;
}
