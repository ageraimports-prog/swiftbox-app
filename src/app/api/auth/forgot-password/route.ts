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

export async function POST(req: Request) {
  let email = "";
  try {
    const body = await req.json();
    email = String(body?.email ?? "").trim();
  } catch {
    /* treat as empty */
  }

  // Always return ok — never reveal whether an email is registered.
  const ok = NextResponse.json({ ok: true });
  if (!email) return ok;

  const rows = await query<UserRow>(
    `SELECT id, email, fname FROM users
      WHERE email = :email AND type = 'member' LIMIT 1`,
    { email }
  );
  const user = rows[0];
  if (!user) return ok;

  const key = user.email.toLowerCase();
  const now = Date.now();
  const prev = lastSent.get(key);
  if (prev && now - prev < RATE_MS) return ok; // already sent recently
  lastSent.set(key, now);

  try {
    const token = await createResetToken(user.id, user.email);
    const resetUrl = `${APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
    await sendPasswordResetEmail(user.email, user.fname || "there", resetUrl);
  } catch (e) {
    // Allow a retry if the send failed.
    lastSent.delete(key);
    console.error("forgot-password: send failed", e);
  }

  return ok;
}
