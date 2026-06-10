import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SESSION_COOKIE = "dome_session";
const PUBLIC_PATHS = ["/login", "/register"];

function secretKey(): Uint8Array {
  return new TextEncoder().encode(
    process.env.AUTH_SECRET || "dev-insecure-secret-change-me-in-prod",
  );
}

async function isValid(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, secretKey());
    return true;
  } catch {
    return false;
  }
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const authed = token ? await isValid(token) : false;
  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  if (!authed && !isPublic) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  if (authed && isPublic) {
    return NextResponse.redirect(new URL("/", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|icons|sw.js).*)",
  ],
};
