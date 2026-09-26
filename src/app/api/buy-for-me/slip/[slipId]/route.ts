import { getSession } from "@/lib/session";
import { readMySlip } from "@/lib/buy-for-me";

/**
 * GET — streams the customer's OWN payment slip. 404 (not 403) for a logged-out
 * visitor or anyone else's slip, so slip ids can't be probed. Never redirects
 * to storage and never reveals the private blob URL.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAFE = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const notFound = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "private, no-store", "Content-Type": "text/plain" } });

export async function GET(_req: Request, { params }: { params: Promise<{ slipId: string }> }) {
  const session = await getSession();
  if (!session) return notFound();
  const { slipId } = await params;
  try {
    const slip = await readMySlip(session.id, Number(slipId));
    if (!slip) return notFound();
    const type = SAFE.includes(slip.contentType) ? slip.contentType : null;
    return new Response(slip.stream, {
      status: 200,
      headers: {
        "Content-Type": type ?? "application/octet-stream",
        "Content-Disposition": `${type ? "inline" : "attachment"}; filename="payment-slip-${Number(slipId)}"`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (e) {
    console.error("[buy-for-me] slip read failed:", e instanceof Error ? e.message : e);
    return notFound();
  }
}
