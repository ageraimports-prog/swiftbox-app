import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

/**
 * Session = signed JWT in an httpOnly cookie. jose (not node:crypto) so the
 * same verify code runs in Edge middleware (Block C route protection).
 */

export const SESSION_COOKIE = "sb_session";
const SESSION_DAYS = 30;

export type SessionUser = {
  /** users.id */
  id: number;
  /** users.ac — customer account number, e.g. "0232" */
  ac: string;
  name: string;
  email: string;
};

function secretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(user: SessionUser): Promise<string> {
  return new SignJWT({ ac: user.ac, name: user.name, email: user.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secretKey());
}

export async function verifySessionToken(
  token: string
): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (!payload.sub) return null;
    return {
      id: Number(payload.sub),
      ac: String(payload.ac ?? ""),
      name: String(payload.name ?? ""),
      email: String(payload.email ?? ""),
    };
  } catch {
    return null;
  }
}

/** Read + verify the session cookie. Null when logged out / expired / tampered. */
export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_DAYS * 24 * 60 * 60,
};
