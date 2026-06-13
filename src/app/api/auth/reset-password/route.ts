import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { execute } from "@/lib/db";
import { verifyResetToken } from "@/lib/reset-token";

const INVALID = { error: "Invalid or expired link" };

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

  const payload = await verifyResetToken(token);
  if (!payload) {
    return NextResponse.json(INVALID, { status: 400 });
  }

  if (newPassword.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters." },
      { status: 400 }
    );
  }

  // Legacy scheme: users.hash = MD5(password) hex. Clear the plaintext
  // users.userpass column at the same time.
  const hash = createHash("md5").update(newPassword).digest("hex");
  await execute(
    `UPDATE users SET hash = :hash, userpass = NULL WHERE id = :userId`,
    { hash, userId: payload.userId }
  );

  return NextResponse.json({ ok: true });
}
