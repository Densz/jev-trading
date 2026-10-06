import { NextResponse, type NextRequest } from "next/server";

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
  const requestOrigin = getRequestOrigin(request);
  if (!requestOrigin) return new NextResponse("Invalid request host.", { status: 403 });
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
