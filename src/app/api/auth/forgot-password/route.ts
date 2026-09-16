import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { createResetToken } from "@/lib/reset-token";
import { sendPasswordResetEmail } from "@/lib/email";

type UserRow = { id: number; email: string; fname: string };

/**
 * Process-level rate limit (good enough at this scale): one reset email per
 * email address per 5 minutes. Resets when the serverless instance recycles.
 */
const lastSent = new Map<string, number>();
const RATE_MS = 5 * 60 * 1000;

const APP_URL = process.env.APP_URL ?? "https://app.swiftboxtt.com";

/** Deliberately loose — this rejects blanks and obvious typos, nothing more. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  let email = "";
  try {
    const body = await req.json();
    email = String(body?.email ?? "").trim();
  } catch {
    /* treat as empty */
  }

  /**
   * A missing or malformed address is a CLIENT error and must say so. It used
   * to fall through to { ok: true }, which told the customer a link had been
   * sent when nothing was ever sent — the blank-address "Check your email"
   * screen. Saying the address is malformed reveals nothing about who has an
   * account; that answer stays generic below.
   */
  if (!email) {
    return NextResponse.json(
      { ok: false, error: "Enter your email address." },
      { status: 400 }
    );
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json(
      { ok: false, error: "That doesn’t look like a valid email address." },
      { status: 400 }
    );
  }

  // Always return ok — never reveal whether an email is registered.
  const ok = NextResponse.json({ ok: true });

  const rows = await query<UserRow>(
    `SELECT id, email, fname FROM users
      WHERE email = :email AND type = 'member' LIMIT 1`,
    { email }
  );
  const user = rows[0];
  if (!user) {
    console.warn("forgot-password: no member account for the address submitted");
    return ok;
  }

  const key = user.email.toLowerCase();
  const now = Date.now();
  const prev = lastSent.get(key);
  if (prev && now - prev < RATE_MS) return ok; // already sent recently
  lastSent.set(key, now);

  // Two independent failure points, logged distinctly so prod logs say which
  // half broke: DB token creation vs SMTP send. { ok: true } stays unconditional
  // either way — never reveal whether the email is registered.
  let token: string;
  try {
    token = await createResetToken(user.id);
  } catch (e) {
    lastSent.delete(key); // allow a retry
    console.error("forgot-password: DB token creation failed", e);
    return ok;
  }

  try {
    const resetUrl = `${APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
    await sendPasswordResetEmail(user.email, user.fname || "there", resetUrl);
  } catch (e) {
    lastSent.delete(key); // allow a retry if the send failed
    console.error("forgot-password: SMTP send failed", e);
  }

  return ok;
}
