import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import { readBody } from "@/server/http";
afterEach(() => vi.unstubAllEnvs());
describe("workspace requests", () => {
  it.each(["development", "production"])("allows access without credentials in %s", (mode) => {
    vi.stubEnv("NODE_ENV", mode);
    const response = proxy(new NextRequest("https://research.example.com/"));
    expect(response.status).toBe(200);
    expect(response.headers.has("www-authenticate")).toBe(false);
  });
  it.each(["127.0.0.1:3000", "localhost:3000", "[::1]:3000"])(
    "accepts browser same-origin JSON writes on %s without APP_ORIGIN",
    (host) => {
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("APP_ORIGIN", "");
      const origin = `http://${host}`;
      const request = new NextRequest(`${origin}/api/tickers/NVDA/analyze`, {
        method: "POST",
        headers: {
          host,
          origin,
          "sec-fetch-site": "same-origin",
          "content-type": "application/json",
        },
      });
      expect(request.nextUrl.hostname).toBe("localhost");
      expect(proxy(request).status).toBe(200);
    },
  );
  it.each([
    "http://localhost:3000",
    "http://127.0.0.1:3001",
    "https://127.0.0.1:3000",
    "http://127.0.0.1:3000.attacker.example",
    "null",
  ])("rejects a non-matching origin %s even on a loopback host", (origin) => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("APP_ORIGIN", "");
    expect(
      proxy(
        new NextRequest("http://127.0.0.1:3000/api/tickers", {
          method: "POST",
          headers: {
            host: "127.0.0.1:3000",
            origin,
            "sec-fetch-site": "same-origin",
            "content-type": "application/json",
          },
        }),
      ).status,
    ).toBe(403);
  });
  it.each(["same-site", "cross-site"])("rejects %s fetch metadata", (fetchSite) => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("APP_ORIGIN", "");
    expect(
      proxy(
        new NextRequest("http://127.0.0.1:3000/api/tickers", {
          method: "POST",
          headers: {
            host: "127.0.0.1:3000",
            origin: "http://127.0.0.1:3000",
            "sec-fetch-site": fetchSite,
            "content-type": "application/json",
          },
        }),
      ).status,
    ).toBe(403);
  });
  it("rejects malformed Host authorities", () => {
    vi.stubEnv("NODE_ENV", "development");
    for (const host of ["user@localhost:3000", "localhost:3000/path", "localhost:99999"])
      expect(proxy(new NextRequest("http://127.0.0.1:3000/", { headers: { host } })).status).toBe(
        403,
      );
  });
  it("honors an explicit canonical origin without trusting forwarded host headers", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_ORIGIN", "https://research.example.com");
    const headers = {
      host: "internal:3000",
      "x-forwarded-host": "attacker.example",
      "sec-fetch-site": "same-origin",
      "content-type": "application/json",
    };
    for (const [origin, status] of [
      ["https://research.example.com", 200],
      ["http://internal:3000", 403],
      ["https://attacker.example", 403],
    ] as const)
      expect(
        proxy(
          new NextRequest("http://internal:3000/api/tickers", {
            method: "POST",
            headers: { ...headers, origin },
          }),
        ).status,
      ).toBe(status);
    vi.stubEnv("APP_ORIGIN", "");
    expect(
      proxy(
        new NextRequest("http://internal:3000/api/tickers", {
          method: "POST",
          headers: { ...headers, origin: "https://attacker.example" },
        }),
      ).status,
    ).toBe(403);
  });
  it("rejects cross-origin and non-JSON writes", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("APP_ORIGIN", "");
    expect(
      proxy(
        new NextRequest("http://127.0.0.1:3000/api/tickers", {
          method: "POST",
          headers: { origin: "https://other.example", "content-type": "application/json" },
        }),
      ).status,
    ).toBe(403);
    expect(
      proxy(
        new NextRequest("http://127.0.0.1:3000/api/tickers", {
          method: "POST",
          headers: { "content-type": "text/plain" },
        }),
      ).status,
    ).toBe(415);
  });
});
describe("bounded server inputs", () => {
  it("rejects invalid JSON and oversized bodies even without Content-Length", async () => {
    await expect(
      readBody(new Request("http://localhost/", { method: "POST", body: "invalid" })),
    ).rejects.toThrow("valid JSON");
    await expect(
      readBody(new Request("http://localhost/", { method: "POST", body: "x".repeat(3000) })),
    ).rejects.toThrow("too large");
  });
});
