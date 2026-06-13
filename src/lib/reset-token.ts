import { SignJWT, jwtVerify } from "jose";

/**
 * Password-reset tokens: a signed JWT (jose, HS256) using SESSION_SECRET.
 * The signature + 1-hour expiry IS the verification — no DB table needed.
 */

const PURPOSE = "password-reset";

function secretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export async function createResetToken(
  userId: number,
  email: string
): Promise<string> {
  return new SignJWT({ email, purpose: PURPOSE })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(userId))
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(secretKey());
}

export type ResetPayload = { userId: number; email: string };

/** Returns the payload for a valid, unexpired reset token, else null. */
export async function verifyResetToken(
  token: string
): Promise<ResetPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (payload.purpose !== PURPOSE || !payload.sub) return null;
    return { userId: Number(payload.sub), email: String(payload.email ?? "") };
  } catch {
    return null;
  }
}
