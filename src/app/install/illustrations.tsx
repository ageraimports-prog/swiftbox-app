/**
 * Drawings for the install steps. Plain SVG shapes that echo what the phone
 * shows — deliberately NOT screenshots of Apple's or Google's UI, which change
 * with every OS release and aren't ours to reproduce.
 */

type IconProps = { className?: string };

/** iOS Share: a box with an arrow coming up out of it. */
export function IosShareIcon({ className = "h-6 w-6" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={className} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12M8 7l4-4 4 4" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.5 10H6.5a1.5 1.5 0 0 0-1.5 1.5v8A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-8A1.5 1.5 0 0 0 17.5 10h-2" />
    </svg>
  );
}

/** "•••" — the More button in Safari's address bar on newer iOS, and in app browsers. */
export function MoreDotsIcon({ className = "h-6 w-6" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  );
}

/** iOS "Add to Home Screen": a plus inside a rounded square. */
export function AddToHomeIcon({ className = "h-6 w-6" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={className} aria-hidden>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
      <path strokeLinecap="round" d="M12 8v8M8 12h8" />
    </svg>
  );
}

/** Android "⋮" menu. */
export function KebabIcon({ className = "h-6 w-6" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <circle cx="12" cy="5" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="12" cy="19" r="2" />
    </svg>
  );
}

/** Safari's compass. */
export function CompassIcon({ className = "h-6 w-6" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={className} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path strokeLinejoin="round" d="m15.5 8.5-2 5-5 2 2-5 5-2Z" />
    </svg>
  );
}

/** A phone with a download arrow — Android "Install app". */
export function InstallPhoneIcon({ className = "h-6 w-6" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={className} aria-hidden>
      <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 7v7m-3-3 3 3 3-3" />
    </svg>
  );
}

export function CheckIcon({ className = "h-6 w-6" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className={className} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
    </svg>
  );
}

export function CopyIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={className} aria-hidden>
      <rect x="8.5" y="8.5" width="12" height="12" rx="2" />
      <path strokeLinecap="round" d="M15.5 8.5V5.5a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3" />
    </svg>
  );
}

/* ── Mock phone UI ───────────────────────────────────────────────────────── */

/** The green ring that says "this one". */
const HL = "rounded-lg ring-2 ring-green ring-offset-2 ring-offset-white";

/** A light panel standing in for the phone's own screen. */
export function MockScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 overflow-hidden rounded-xl bg-white p-3 text-ink shadow-inner" aria-hidden>
      {children}
    </div>
  );
}

/** Safari's bottom toolbar, Share highlighted. */
export function MockSafariToolbar() {
  return (
    <div className="flex items-center justify-around text-[#007aff]">
      <span className="text-2xl leading-none text-gray-300">‹</span>
      <span className="text-2xl leading-none text-gray-300">›</span>
      <span className={`p-1.5 ${HL}`}>
        <IosShareIcon className="h-7 w-7" />
      </span>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-6 w-6 text-gray-300">
        <path d="M12 6.5c-2-1.5-5-2-8-1.5v13c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V5c-3-.5-6 0-8 1.5Zm0 0v13" />
      </svg>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-6 w-6 text-gray-300">
        <rect x="4" y="7" width="12" height="13" rx="2" />
        <path d="M8 4h10a2 2 0 0 1 2 2v10" />
      </svg>
    </div>
  );
}

/** An address bar with a "•••" (or ⋮) button at the end, highlighted. */
export function MockAddressBar({
  menu = "dots",
  url = "app.swiftboxtt.com",
}: {
  menu?: "dots" | "kebab" | "share";
  url?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex min-w-0 flex-1 items-center rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-600">
        <span className="truncate">{url}</span>
      </div>
      <span className={`p-1.5 ${menu === "kebab" ? "text-gray-700" : "text-[#007aff]"} ${HL}`}>
        {menu === "dots" && <MoreDotsIcon className="h-6 w-6" />}
        {menu === "kebab" && <KebabIcon className="h-6 w-6" />}
        {menu === "share" && <IosShareIcon className="h-6 w-6" />}
      </span>
    </div>
  );
}

export type MockRow = { label: string; icon?: React.ReactNode; highlight?: boolean };

/** A share sheet / overflow menu: a short list with one row highlighted. */
export function MockMenu({ rows }: { rows: MockRow[] }) {
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => (
        <li
          key={r.label}
          className={`flex items-center justify-between px-3 py-2.5 text-[15px] ${
            r.highlight ? `bg-green/10 font-semibold ${HL}` : "rounded-lg bg-gray-50 text-gray-400"
          }`}
        >
          <span>{r.label}</span>
          {r.icon && <span className={r.highlight ? "text-ink" : "text-gray-300"}>{r.icon}</span>}
        </li>
      ))}
    </ul>
  );
}

/** The "Add to Home Screen" sheet header on iPhone, with Add highlighted. */
export function MockIosAddSheet() {
  return (
    <div>
      <div className="flex items-center justify-between text-[15px]">
        <span className="text-[#007aff]">Cancel</span>
        <span className="font-semibold">Add to Home Screen</span>
        <span className={`px-2 py-1 font-semibold text-[#007aff] ${HL}`}>Add</span>
      </div>
      <div className="mt-3 flex items-center gap-3 rounded-lg bg-gray-50 p-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" className="h-11 w-11 rounded-[10px]" />
        <div className="text-sm">
          <p className="font-semibold">Swiftbox</p>
          <p className="text-gray-400">app.swiftboxtt.com</p>
        </div>
      </div>
    </div>
  );
}

/** Android's "Install app?" confirmation, with Install highlighted. */
export function MockAndroidInstallDialog() {
  return (
    <div className="rounded-lg bg-gray-50 p-3">
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" className="h-10 w-10 rounded-full" />
        <div className="text-sm">
          <p className="font-semibold">Install app?</p>
          <p className="text-gray-400">Swiftbox · app.swiftboxtt.com</p>
        </div>
      </div>
      <div className="mt-3 flex justify-end gap-4 text-[15px] font-semibold text-[#1a73e8]">
        <span className="px-2 py-1 text-gray-400">Cancel</span>
        <span className={`px-3 py-1 ${HL}`}>Install</span>
      </div>
    </div>
  );
}
