import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  sendDeletionAcknowledgement,
  sendDeletionRequestToSupport,
} from "@/lib/account-deletion-email";

/**
 * Receives an account-deletion request (Google Play User Data policy).
 * Public on purpose: Play requires the web form to work for people who have
 * already uninstalled the app and can no longer sign in.
 */

// One request per email per 10 minutes, per serverless instance.
const lastSent = new Map<string, number>();
const RATE_MS = 10 * 60 * 1000;

export async function POST(req: Request) {
  let name = "";
  let email = "";
  let accountNo = "";
  let reason = "";

  try {
    const body = await req.json();
    name = String(body?.name ?? "").trim().slice(0, 120);
    email = String(body?.email ?? "").trim().slice(0, 200);
    accountNo = String(body?.accountNo ?? "").trim().slice(0, 40);
    reason = String(body?.reason ?? "").trim().slice(0, 1000);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  if (!name || !email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json(
      { ok: false, error: "Please enter your name and a valid email address." },
      { status: 400 }
    );
  }

  const session = await getSession();
  const source: "app" | "web" = session ? "app" : "web";

  const key = email.toLowerCase();
  const now = Date.now();
  const prev = lastSent.get(key);
  if (prev && now - prev < RATE_MS) {
    // Already logged — answer as success so the customer isn't stuck.
    return NextResponse.json({ ok: true });
  }
  lastSent.set(key, now);

  const payload = {
    name,
    email,
    accountNo: accountNo || session?.ac,
    reason,
    source,
  };

  try {
    await sendDeletionRequestToSupport(payload);
  } catch (e) {
    lastSent.delete(key);
    console.error("delete-request: support notification failed", e);
    return NextResponse.json(
      {
        ok: false,
        error:
          "We couldn't submit that just now. Please WhatsApp 1 (868) 609-3000 and we'll handle it.",
      },
      { status: 500 }
    );
  }

  // The acknowledgement is a courtesy — never fail the request over it.
  try {
    await sendDeletionAcknowledgement(payload);
  } catch (e) {
    console.error("delete-request: customer acknowledgement failed", e);
  }

  return NextResponse.json({ ok: true });
}
