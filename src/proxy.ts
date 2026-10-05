import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

function equals(a: string, b: string) {
  const first = Buffer.from(a);
  const second = Buffer.from(b);
  return first.length === second.length && timingSafeEqual(first, second);
}
function getRequestOrigin(request: NextRequest) {
  // NextURL normalizes loopback IPs to "localhost". Host preserves the browser's authority.
  // Ignore forwarded host headers; reverse-proxy deployments must set APP_ORIGIN explicitly.
  try {
    const host = request.headers.get("host") ?? request.nextUrl.host;
    const url = new URL(`${request.nextUrl.protocol}//${host}`);
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    return url;
  } catch {
    return null;
  }
}
export function proxy(request: NextRequest) {
  // Cron authenticates with a separate server token inside its handler.
  if (request.nextUrl.pathname === "/api/cron/daily") return NextResponse.next();
  const password = process.env.APP_PASSWORD?.trim();
  if (process.env.NODE_ENV === "production" && (!password || password.length < 16))
    return new NextResponse(
      "Set APP_PASSWORD to at least 16 characters before starting production.",
      { status: 503 },
    );
  if (password) {
    const auth = request.headers.get("authorization");
    const expected = `Basic ${Buffer.from(`personal:${password}`).toString("base64")}`;
    if (!auth || !equals(auth, expected))
      return new NextResponse("Authentication required", {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="Jev Personal", charset="UTF-8"' },
      });
  }
  const requestOrigin = getRequestOrigin(request);
  if (!requestOrigin) return new NextResponse("Invalid request host.", { status: 403 });
  if (!password && !["localhost", "127.0.0.1", "[::1]"].includes(requestOrigin.hostname)) {
    return new NextResponse("Local access only. Configure APP_PASSWORD for remote access.", {
      status: 403,
    });
  }
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const origin = request.headers.get("origin");
    const expectedOrigin = process.env.APP_ORIGIN?.trim() || requestOrigin.origin;
    if (origin && origin !== expectedOrigin)
      return NextResponse.json({ error: "Cross-origin writes are not allowed." }, { status: 403 });
    const fetchSite = request.headers.get("sec-fetch-site");
    if (fetchSite && !["same-origin", "none"].includes(fetchSite))
      return NextResponse.json({ error: "Cross-origin writes are not allowed." }, { status: 403 });
    const contentType = request.headers.get("content-type");
    if (!contentType?.startsWith("application/json"))
      return NextResponse.json({ error: "Use application/json." }, { status: 415 });
  }
  return NextResponse.next();
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
