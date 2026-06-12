import { createHash, timingSafeEqual } from "node:crypto";
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

/** Legacy scheme (verified against live data): users.hash = MD5(password) hex. */
function md5Matches(password: string, storedHash: string): boolean {
  const submitted = createHash("md5").update(password).digest("hex");
  const stored = storedHash.trim().toLowerCase();
  if (stored.length !== submitted.length) return false;
  return timingSafeEqual(Buffer.from(submitted), Buffer.from(stored));
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
  if (!user || !md5Matches(password, user.hash)) {
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
