import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getCbBill, fetchCbBillPdf } from "@/lib/consolidated-billing";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET — the bill as a PDF. The admin renders every Swiftbox PDF; this route
 * checks the bill is the session customer's first, and the admin checks it
 * again, so neither side alone can hand out someone else's bill.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ billNo: string }> }) {
  const session = await getSession();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  const billNo = decodeURIComponent((await params).billNo);
  if (!(await getCbBill(session.id, billNo))) return new NextResponse("Not found", { status: 404 });
  const pdf = await fetchCbBillPdf(session.id, billNo);
  if (!pdf) return new NextResponse("The PDF isn't available right now. Please try again shortly.", { status: 503 });
  return new NextResponse(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${billNo}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
