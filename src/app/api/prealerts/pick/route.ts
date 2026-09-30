import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { CLOSED_MESSAGE, DESCRIPTION_MAX, parseDescription, parseValueUsd } from "@/lib/prealert-pick";
import { submitPickedPrealert } from "@/lib/prealert-pick-server";

/**
 * POST — pre-alert a package we already hold. Body: { packageId, description,
 * valueUsd }. ANY other field (tracking, carrier, weight…) is ignored: those
 * come from the package row, server-side (submitPickedPrealert).
 *
 *   200 { status: "saved" | "already", next, remaining }
 *   400 { error, field }            validation
 *   409 { status: "closed", error } not theirs / not found / on a shipment
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const pkId = Number(body.packageId);
  if (!Number.isInteger(pkId) || pkId <= 0) {
    return NextResponse.json({ status: "closed", error: CLOSED_MESSAGE }, { status: 409 });
  }
  const description = parseDescription(body.description);
  if (!description) {
    return NextResponse.json(
      { error: `Tell us what's inside (up to ${DESCRIPTION_MAX} characters).`, field: "description" },
      { status: 400 }
    );
  }
  const valueUsd = parseValueUsd(body.valueUsd);
  if (valueUsd == null) {
    return NextResponse.json(
      { error: "Enter the value in US dollars, e.g. 12.50.", field: "valueUsd" },
      { status: 400 }
    );
  }

  const result = await submitPickedPrealert(session, pkId, { description, valueUsd });
  if (result.status === "closed") {
    return NextResponse.json({ status: "closed", error: CLOSED_MESSAGE }, { status: 409 });
  }
  return NextResponse.json({
    status: result.status,
    next: result.next,
    remaining: result.remaining,
    ...(result.prealertId ? { prealertId: result.prealertId } : {}),
  });
}
