import { NextResponse } from "next/server";
import { query, execute } from "@/lib/db";
import { getSession } from "@/lib/session";
import { prealertLockedSql, prealertMatchedSql } from "@/lib/prealert-lock-sql";
import { LOCKED_MESSAGE } from "@/lib/prealert-edit-core";

/**
 * Customer pre-alerts, backed by swiftbox_prealerts. user_id + account_no come
 * from the session (account_no is denormalised so admin queries don't re-join
 * users). status defaults to 'pending' and the timestamps default in MySQL —
 * none of those are written here.
 */

type Row = {
  prealert_id: number;
  store_name: string;
  tracking_number: string;
  freight_type: "AIR" | "SEA";
  invoice_value_usd: string;
  status: "pending" | "received" | "processed";
  created_at: string;
  description: string | null;
  item_count: number | string;
  locked: number | string;
  matched: number | string;
};

/** GET — the logged-in customer's pre-alerts, newest first. */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await query<Row>(
    `SELECT sp.prealert_id, sp.store_name, sp.tracking_number, sp.freight_type,
            sp.invoice_value_usd, sp.status, sp.created_at, sp.description, sp.item_count,
            ${prealertLockedSql("sp")} AS locked, ${prealertMatchedSql("sp")} AS matched
       FROM swiftbox_prealerts sp
      WHERE sp.user_id = :userId
      ORDER BY sp.created_at DESC`,
    { userId: session.id }
  );

  const prealerts = rows.map((r) => ({
    id: Number(r.prealert_id),
    storeName: r.store_name,
    trackingNumber: r.tracking_number,
    freightType: r.freight_type,
    invoiceValueUsd: Number(r.invoice_value_usd),
    status: r.status,
    createdAt: r.created_at,
    description: (r.description ?? "").trim(),
    itemCount: Number(r.item_count),
    // Edit / Cancel: shown unless locked (prealert-edit-core.ts, the admin's rules).
    locked: Number(r.locked) === 1,
    lockMessage: Number(r.locked) === 1 ? LOCKED_MESSAGE : null,
    canEditTracking: Number(r.matched) !== 1,
  }));

  return NextResponse.json({ prealerts });
}

/** POST — create a pre-alert for the logged-in customer. */
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

  const storeName = String(body.storeName ?? "").trim();
  const trackingNumber = String(body.trackingNumber ?? "").trim();
  const description = String(body.description ?? "").trim();
  const itemCount = Number(body.itemCount);
  const invoiceValueUsd = Number(body.invoiceValueUsd);
  const freightType = String(body.freightType ?? "").trim().toUpperCase();

  // ── Server-side validation (the source of truth) ────────────────────────
  if (!storeName) {
    return NextResponse.json({ error: "Store / merchant name is required." }, { status: 400 });
  }
  if (storeName.length > 100) {
    return NextResponse.json({ error: "Store name must be 100 characters or fewer." }, { status: 400 });
  }
  if (!trackingNumber) {
    return NextResponse.json({ error: "US tracking number is required." }, { status: 400 });
  }
  if (trackingNumber.length > 100) {
    return NextResponse.json({ error: "Tracking number must be 100 characters or fewer." }, { status: 400 });
  }
  if (!description) {
    return NextResponse.json({ error: "Description of contents is required." }, { status: 400 });
  }
  if (!Number.isInteger(itemCount) || itemCount < 1 || itemCount > 255) {
    return NextResponse.json({ error: "Number of items must be a whole number of at least 1." }, { status: 400 });
  }
  if (!Number.isFinite(invoiceValueUsd) || invoiceValueUsd <= 0) {
    return NextResponse.json({ error: "Invoice value must be greater than 0." }, { status: 400 });
  }
  if (invoiceValueUsd > 99999999.99) {
    return NextResponse.json({ error: "Invoice value is too large." }, { status: 400 });
  }
  if (freightType !== "AIR" && freightType !== "SEA") {
    return NextResponse.json({ error: "Freight type must be AIR or SEA." }, { status: 400 });
  }

  const result = await execute(
    `INSERT INTO swiftbox_prealerts
       (user_id, account_no, store_name, tracking_number, description,
        item_count, invoice_value_usd, freight_type)
     VALUES
       (:userId, :accountNo, :storeName, :trackingNumber, :description,
        :itemCount, :invoiceValueUsd, :freightType)`,
    {
      userId: session.id,
      accountNo: session.ac,
      storeName,
      trackingNumber,
      description,
      itemCount,
      // DECIMAL(10,2) — send a fixed-2dp string so precision never drifts.
      invoiceValueUsd: invoiceValueUsd.toFixed(2),
      freightType,
    }
  );

  return NextResponse.json({ ok: true, prealert_id: result.insertId });
}
