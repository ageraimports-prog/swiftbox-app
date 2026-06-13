"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 12 11.2 3.05a1.125 1.125 0 0 1 1.6 0L21.75 12M4.5 9.75v9a1.5 1.5 0 0 0 1.5 1.5h3.75v-4.5a1.5 1.5 0 0 1 1.5-1.5h1.5a1.5 1.5 0 0 1 1.5 1.5v4.5H18a1.5 1.5 0 0 0 1.5-1.5v-9"
      />
    ),
  },
  {
    href: "/dashboard/packages",
    label: "Packages",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9"
      />
    ),
  },
  {
    href: "/dashboard/prealerts",
    label: "Pre-alert",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"
      />
    ),
  },
  {
    href: "/dashboard/invoices",
    label: "Invoices",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 7.5h6m-6 3.75h6m-6 3.75h3.75M5.25 3h13.5a.75.75 0 0 1 .75.75v16.5l-3-1.5-3 1.5-3-1.5-3 1.5-3-1.5V3.75A.75.75 0 0 1 5.25 3Z"
      />
    ),
  },
  {
    href: "/dashboard/account",
    label: "Account",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M17.982 18.725A7.488 7.488 0 0 0 12 15.75a7.488 7.488 0 0 0-5.982 2.975m11.963 0a9 9 0 1 0-11.963 0m11.963 0A8.966 8.966 0 0 1 12 21a8.966 8.966 0 0 1-5.982-2.275M15 9.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
      />
    ),
  },
];

export default function TabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-mist/10 bg-ink-2/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <div className="mx-auto flex max-w-md">
        {TABS.map((tab) => {
          const active =
            tab.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-semibold transition-colors ${
                active ? "text-green" : "text-muted-dark hover:text-mist"
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.7}
                className="h-6 w-6"
                aria-hidden
              >
                {tab.icon}
              </svg>
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
