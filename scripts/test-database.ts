import "dotenv/config";
export function testDatabaseUrl() {
  const url = new URL(
    process.env.TEST_DATABASE_URL ??
      process.env.DATABASE_URL ??
      "postgresql://jev:jev_local_password@127.0.0.1:5434/jev",
  );
  if (!process.env.TEST_DATABASE_URL) url.pathname = `${url.pathname}_test`;
  if (!/^\/[a-zA-Z0-9_]+_test$/.test(url.pathname))
    throw new Error("TEST_DATABASE_URL must point to a dedicated database ending in _test.");
  return url.toString();
}
