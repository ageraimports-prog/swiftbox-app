import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { uploadMySlip } from "@/lib/buy-for-me";
import { isBfmEnabled } from "@/lib/bfm-switch";
import { BFM_PAUSED_MESSAGE } from "@/lib/bfm-switch-core";

/**
 * POST (multipart, field "file") — the customer's payment slip. Goes THROUGH
 * this server into the private blob store (a browser-direct upload would hand
 * the blob URL back to the browser). Nothing about where it is stored is
 * returned — only ok / an error.
 *
 * 403 with the paused message while Buy For Me is switched off — refused before
 * the upload is even read (uploadMySlip re-checks).
 */
export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isBfmEnabled())) return NextResponse.json({ error: BFM_PAUSED_MESSAGE, paused: true }, { status: 403 });
  const { id } = await params;
  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get("file");
    file = f instanceof File ? f : null;
  } catch {
    return NextResponse.json({ error: "Please choose a file to upload." }, { status: 400 });
  }
  if (!file) return NextResponse.json({ error: "Please choose a file to upload." }, { status: 400 });
  try {
    const r = await uploadMySlip(session, Number(id), file);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[buy-for-me] slip upload failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "We couldn't save your slip just now — please try again." }, { status: 500 });
  }
}
