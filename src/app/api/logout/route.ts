import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

function logout(req: NextRequest) {
  // 303 so a form POST lands on /login as a GET
  const res = NextResponse.redirect(new URL("/login", req.url), 303);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}

export const POST = logout;
/** GET supported so internal redirects (e.g. orphaned session) can clear too. */
export const GET = logout;
