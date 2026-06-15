import { createHash, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import {
  createSessionToken,
  sessionCookieOptions,
  SESSION_COOKIE,
} from "@/lib/session";

type UserRow = {
  id: number;
  fname: string;
  lname: string;
  email: string;
  ac: string;
  hash: string;
  active: string;
};

const GENERIC_ERROR = "Incorrect account number, email or password.";

/**
 * Dual-verify. Migrated accounts have a bcrypt hash ($2a/$2b/$2y…); everyone
 * else still has a 32-char MD5 hex (the legacy scheme, verified against live
 * data), which can never start with "$2", so it always falls to the MD5 path.
 * No flag day — an account only takes the bcrypt branch after a successful reset.
 */
async function passwordMatches(password: string, storedHash: string): Promise<boolean> {
  const stored = storedHash.trim();
  if (/^\$2[aby]\$/.test(stored)) {
    try {
      return await bcrypt.compare(password, stored);
    } catch {
      return false;
    }
  }
  const submitted = createHash("md5").update(password).digest("hex");
  const lower = stored.toLowerCase();
  if (lower.length !== submitted.length) return false;
  return timingSafeEqual(Buffer.from(submitted), Buffer.from(lower));
}

export async function POST(req: Request) {
  let identifier = "";
  let password = "";
  try {
    const body = await req.json();
    identifier = String(body?.identifier ?? "").trim();
    password = String(body?.password ?? "");
  } catch {
    /* fall through to the empty-field check */
  }

  if (!identifier || !password) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
  }

  // Account numbers are stored zero-padded to 4 ("0232") with "0" as the
  // unset default, so "232" is padded for the lookup and "0"/"" never match.
  const rows = await query<UserRow>(
    `SELECT id, fname, lname, email, ac, hash, active
       FROM users
      WHERE type = 'member'
        AND (
          email = :id
          OR (ac <> '0' AND ac <> '' AND (ac = :id OR ac = LPAD(:id, 4, '0')))
        )
      LIMIT 1`,
    { id: identifier }
  );

  const user = rows[0];
  if (!user || !(await passwordMatches(password, user.hash))) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
  }

  // Members are only ever 'y' (active) or 't' (trial) in live data; reject
  // disabled/banned outright but keep the response indistinguishable.
  if (user.active !== "y" && user.active !== "t") {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
  }

  const token = await createSessionToken({
    id: user.id,
    ac: user.ac,
    name: `${user.fname} ${user.lname}`.trim(),
    email: user.email,
  });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
  return res;
}
