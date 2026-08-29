import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/constants";

function allowedOrigin(origin: string | null, requestUrl: string): string | null {
  if (!origin) return null;
  try {
    if (origin === new URL(requestUrl).origin) return origin;
  } catch {
    /* ignore */
  }
  const app = process.env.APP_URL;
  const publicApp = process.env.NEXT_PUBLIC_APP_URL;
  const vercel = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL.replace(/^https?:\/\//, "")}` : "";
  const extra = (process.env.CORS_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const allow = [app, publicApp, vercel, ...extra].filter(Boolean) as string[];
  if (allow.includes(origin)) return origin;
  return null;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const origin = request.headers.get("origin");
  const allow = allowedOrigin(origin, request.url);

  if (request.method === "OPTIONS") {
    const res = new NextResponse(null, { status: 204 });
    if (allow) {
      res.headers.set("Access-Control-Allow-Origin", allow);
      res.headers.set("Access-Control-Allow-Credentials", "true");
      res.headers.set("Access-Control-Allow-Headers", "content-type, x-csrf-token, idempotency-key");
      res.headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
      res.headers.set("Vary", "Origin");
    }
    return res;
  }

  if (pathname.startsWith("/host") && pathname !== "/host/login") {
    if (!request.cookies.get(SESSION_COOKIE)?.value) {
      const login = new URL("/host/login", request.url);
      return NextResponse.redirect(login);
    }
  }

  const participantProtected =
    pathname === "/home" || pathname.startsWith("/home/") || pathname.startsWith("/play/") || pathname === "/join" || pathname.startsWith("/join/");
  if (participantProtected && !request.cookies.get(SESSION_COOKIE)?.value) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-clashiq-path", pathname);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("x-clashiq-path", pathname);
  if (allow) {
    res.headers.set("Access-Control-Allow-Origin", allow);
    res.headers.set("Access-Control-Allow-Credentials", "true");
    res.headers.set("Vary", "Origin");
  }
  return res;
}

export const config = {
  matcher: ["/host", "/host/:path*", "/home", "/home/:path*", "/join", "/join/:path*", "/play/:path*", "/api/:path*"],
};
