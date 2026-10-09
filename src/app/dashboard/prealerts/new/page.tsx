"use client";

import Link from "next/link";
import PrealertForm from "@/components/PrealertForm";

/** New pre-alert. The form is shared with the edit page (components/PrealertForm.tsx). */
export default function NewPreAlertPage() {
  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/dashboard/prealerts"
        className="flex w-fit items-center gap-1.5 text-sm font-semibold text-muted-dark transition-colors hover:text-mist"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className="h-4 w-4"
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
        </svg>
        Pre-alerts
      </Link>

      <h1 className="sb-disp text-2xl text-mist">New pre-alert</h1>

      <PrealertForm />
    </div>
  );
}
