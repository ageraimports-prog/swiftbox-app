"use client";

import * as React from "react";
import Link from "next/link";
import { BFM_PAUSED_MESSAGE, MIAMI_ADDRESS_PATH } from "@/lib/bfm-switch-core";
import { card, greenButton } from "./ui";

/**
 * The Buy For Me switch as the pages under /dashboard/buy-for-me see it. Set
 * once by layout.tsx from the server's fail-closed reader (src/lib/bfm-switch.ts);
 * the default is OFF, so a page rendered outside the layout never offers it.
 */
const BfmEnabledContext = React.createContext(false);

export function BfmEnabledProvider({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  return <BfmEnabledContext.Provider value={enabled}>{children}</BfmEnabledContext.Provider>;
}

export function useBfmEnabled(): boolean {
  return React.useContext(BfmEnabledContext);
}

/**
 * What a customer sees instead of Buy For Me while it is paused. `compact` is
 * the one-line note above a customer's existing requests.
 */
export function BfmPaused({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <div role="status" className="rounded-lg border border-amber-300/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
        {BFM_PAUSED_MESSAGE}{" "}
        <Link href={MIAMI_ADDRESS_PATH} className="font-semibold text-green underline underline-offset-2">
          See my Miami address
        </Link>
      </div>
    );
  }
  return (
    <section className={`${card} flex flex-col items-center px-6 py-10 text-center`}>
      <p className="sb-disp text-lg text-mist">Buy For Me is paused</p>
      <p className="mt-2 max-w-[20rem] text-sm text-muted-dark">{BFM_PAUSED_MESSAGE}</p>
      <Link href={MIAMI_ADDRESS_PATH} className={`${greenButton} mt-6`}>
        See my Miami address
      </Link>
    </section>
  );
}
