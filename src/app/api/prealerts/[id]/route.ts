import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { customerCancelPrealert, customerEditPrealert, loadOwnPrealert, viewOf, type EditResult } from "@/lib/prealert-edit-server";

/**
 * One of the customer's OWN pre-alerts (swiftbox_prealerts).
 *   GET    → the edit form's values, lock state, whether tracking is editable
 *   PATCH  → { fields, expected } edit (store, description, items, value, freight;
 *            tracking only while no package matches it)
 *   DELETE → { expected } cancel
 *
 * 401 signed out · 404 not found OR not theirs (identical) · 409 stale form or
 * locked (matched package cleared / invoiced) · 422 bad values, per field.
 * Rules: src/lib/prealert-edit-core.ts (twin of the admin's); DB:
 * src/lib/prealert-edit-server.ts. The invoice file has its own route, ./file.
 */

type Ctx = { params: Promise<{ id: string }> };

function reply(r: EditResult) {
  if (r.ok) return NextResponse.json({ ok: true, changed: r.changed, prealert: r.prealert });
  const { status, ...body } = r;
  return NextResponse.json(body, { status });
}

async function body(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const b = await req.json();
    return b && typeof b === "object" ? (b as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function GET(_req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const own = await loadOwnPrealert(session, Number(id));
  if (!own) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ prealert: viewOf(own) });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const b = await body(req);
  if (!b) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  const fields = b.fields && typeof b.fields === "object" ? (b.fields as Record<string, unknown>) : {};
  try {
    return reply(await customerEditPrealert(session, Number(id), fields, b.expected));
  } catch (e) {
    console.error("[prealerts] edit failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "We couldn't save your changes just now. Please try again." }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const b = (await body(req)) ?? {};
  try {
    return reply(await customerCancelPrealert(session, Number(id), b.expected));
  } catch (e) {
    console.error("[prealerts] cancel failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "We couldn't cancel this pre-alert just now. Please try again." }, { status: 500 });
  }
}
