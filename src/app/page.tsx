import Image from "next/image";

/**
 * SP01 Block A — temporary design-system preview.
 * Replaced by the login redirect in Block B.
 */
export default function Home() {
  return (
    <main className="min-h-screen bg-ink pb-16">
      {/* Header */}
      <header className="flex items-center justify-between px-5 pt-6">
        <Image
          src="/logos/swiftbox-logo-on-dark.png"
          alt="Swiftbox"
          width={656}
          height={142}
          priority
          className="h-8 w-auto"
        />
        <span className="rounded-sm bg-green/10 px-2.5 py-1 text-xs font-semibold text-green">
          SP01 · Block A
        </span>
      </header>

      {/* Hero */}
      <section className="relative px-5 pt-12 pb-8">
        <div className="sb-glow absolute inset-x-0 top-0 h-64" aria-hidden />
        <h1 className="sb-disp relative text-4xl leading-tight text-mist">
          Design system
          <span className="block text-green">is live.</span>
        </h1>
        <p className="relative mt-3 text-sm text-muted-dark">
          Foundation, brand tokens, Archivo, logo kit &amp; PWA manifest —
          ready for the login build.
        </p>
      </section>

      {/* Color tokens */}
      <section className="px-5">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-dark">
          Colors
        </h2>
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-md bg-green p-3 pt-12">
            <p className="text-xs font-bold text-ink">Green</p>
            <p className="text-[10px] text-ink/70">#00FF40</p>
          </div>
          <div className="rounded-md border border-mist/15 bg-ink-2 p-3 pt-12">
            <p className="text-xs font-bold text-mist">Ink</p>
            <p className="text-[10px] text-muted-dark">#0E1114</p>
          </div>
          <div className="rounded-md bg-mist p-3 pt-12">
            <p className="text-xs font-bold text-ink">Mist</p>
            <p className="text-[10px] text-muted">#F4F5F2</p>
          </div>
        </div>
      </section>

      {/* Typography */}
      <section className="mt-8 px-5">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-dark">
          Typography — Archivo
        </h2>
        <div className="rounded-lg bg-mist p-5">
          <p className="sb-disp text-2xl text-ink">Display 800</p>
          <p className="mt-1 text-base font-semibold text-ink">Semibold 600</p>
          <p className="mt-1 text-sm text-muted">
            Body 400 — Track your packages and manage your Skybox.
          </p>
        </div>
      </section>

      {/* Buttons */}
      <section className="mt-8 px-5">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-dark">
          Buttons
        </h2>
        <div className="flex flex-col gap-3">
          <button className="w-full rounded-xl bg-green px-6 py-3.5 text-sm font-bold text-ink transition-colors hover:bg-green-deep">
            Primary CTA →
          </button>
          <button className="w-full rounded-xl border border-mist/25 px-6 py-3.5 text-sm font-semibold text-mist transition-colors hover:border-green hover:text-green">
            Secondary
          </button>
        </div>
      </section>

      {/* Logo kit */}
      <section className="mt-8 px-5">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-dark">
          Logo kit
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center justify-center rounded-md bg-ink-2 p-5">
            <Image
              src="/logos/swiftbox-logo-on-dark.png"
              alt="Logo on dark"
              width={656}
              height={142}
              className="h-6 w-auto"
            />
          </div>
          <div className="flex items-center justify-center rounded-md bg-mist p-5">
            <Image
              src="/logos/swiftbox-logo-primary.png"
              alt="Logo primary"
              width={656}
              height={142}
              className="h-6 w-auto"
            />
          </div>
          <div className="flex items-center justify-center rounded-md bg-mist p-5">
            <Image
              src="/logos/swiftbox-icon.png"
              alt="Icon mark"
              width={261}
              height={142}
              className="h-8 w-auto"
            />
          </div>
          <div className="flex items-center justify-center rounded-md bg-ink-2 p-5">
            <Image
              src="/icons/icon-192.png"
              alt="PWA app icon"
              width={192}
              height={192}
              className="h-12 w-12 rounded-md"
            />
          </div>
        </div>
      </section>
    </main>
  );
}
