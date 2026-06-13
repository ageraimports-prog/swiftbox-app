import Image from "next/image";

/** Branded shell shared by the login / forgot / reset pages. */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="relative flex min-h-screen flex-col bg-ink px-5 pt-[max(env(safe-area-inset-top),2.5rem)] pb-[max(env(safe-area-inset-bottom),2rem)]">
      <div className="sb-glow absolute inset-x-0 top-0 h-72" aria-hidden />

      <header className="relative flex justify-center pt-2 pb-10">
        <Image
          src="/logos/swiftbox-logo-on-dark.png"
          alt="Swiftbox"
          width={656}
          height={142}
          priority
          className="h-9 w-auto"
        />
      </header>

      <section className="relative mx-auto w-full max-w-md">{children}</section>
    </main>
  );
}
