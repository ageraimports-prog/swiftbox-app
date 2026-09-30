import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { attachPrealertFile } from "@/lib/prealert-file-server";

/**
 * POST (multipart, field "file") — attach the optional invoice/receipt to one of
 * the customer's OWN pre-alerts. Goes through this server into the private blob
 * store; nothing about where it is stored is returned, only ok / an error.
 */
export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    const r = await attachPrealertFile(session, Number(id), file);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[prealert-file] upload failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "We couldn't save your invoice just now." }, { status: 500 });
  }
}
