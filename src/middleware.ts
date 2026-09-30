import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";
import { safeNext } from "@/lib/next-path";

const PROTECTED_PREFIXES = ["/dashboard", "/account"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const user = token ? await verifySessionToken(token) : null;

  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );

  if (isProtected && !user) {
    const login = new URL("/login", req.url);
    // Come back here after logging in (e.g. a WhatsApp link to Buy For Me).
    const back = safeNext(pathname + req.nextUrl.search);
    if (back && back !== "/dashboard") login.searchParams.set("next", back);
    return NextResponse.redirect(login);
  }

  if (pathname === "/login" && user) {
    const back = safeNext(req.nextUrl.searchParams.get("next"));
    return NextResponse.redirect(new URL(back ?? "/dashboard", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/account/:path*", "/login"],
};
