import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { execute } from "@/lib/db";
import { claimResetToken } from "@/lib/reset-token";

const INVALID = { error: "Invalid or expired link" };
const BCRYPT_ROUNDS = 10;

export async function POST(req: Request) {
  let token = "";
  let newPassword = "";
  try {
    const body = await req.json();
    token = String(body?.token ?? "");
    newPassword = String(body?.newPassword ?? "");
  } catch {
    return NextResponse.json(INVALID, { status: 400 });
  }

  // Validate the password BEFORE consuming the token, so a too-short attempt
  // doesn't burn the single-use link.
  if (newPassword.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters." },
      { status: 400 }
    );
  }

  const userId = await claimResetToken(token);
  if (userId == null) {
    return NextResponse.json(INVALID, { status: 400 });
  }

  // Migration moment: write a bcrypt hash (replacing the legacy MD5) and clear
  // the legacy plaintext column. Login's dual-verify then takes the bcrypt path
  // for this account from here on.
  const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await execute(
    `UPDATE users SET hash = :hash, userpass = NULL WHERE id = :userId`,
    { hash, userId }
  );

  return NextResponse.json({ ok: true });
}
