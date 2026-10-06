import "server-only";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import {
  DEFAULT_PROFILE_LOOKUP_LIMIT,
  DEFAULT_TWEET_LIMIT,
  tweetLimitSchema,
} from "@/types/social";

const optionalSecret = z
  .string()
  .optional()
  .transform((value) => value?.trim() || undefined);
const schema = z.object({
  DATABASE_URL: z.url().default("postgresql://jev:jev_local_password@127.0.0.1:5434/jev"),
  TYPESAFE_API_KEY: optionalSecret,
  TWELVE_DATA_API_KEY: optionalSecret,
  FINNHUB_API_KEY: optionalSecret,
  X_BEARER_TOKEN: optionalSecret,
  X_DEFAULT_TWEET_LIMIT: z.coerce.number().pipe(tweetLimitSchema).default(DEFAULT_TWEET_LIMIT),
  X_POST_READ_COST_USD: z.coerce.number().positive().default(0.005),
  X_PROFILE_READ_COST_USD: z.coerce.number().positive().default(0.01),
  X_PROFILE_LOOKUP_LIMIT: z.coerce
    .number()
    .int()
    .min(0)
    .max(10)
    .default(DEFAULT_PROFILE_LOOKUP_LIMIT),
  X_PROFILE_CACHE_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  SEC_USER_AGENT: optionalSecret,
  TYPESAFE_MODEL: z.string().default("jev-1.13.0"),
  DEMO_MODE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  INVESTMENT_HORIZON: z.enum(["short-term", "medium-term", "long-term"]).default("medium-term"),
  TWELVE_DATA_CREDITS_PER_MINUTE: z.coerce.number().int().min(1).max(10000).default(8),
  JEV_INPUT_USD_PER_MILLION: z.coerce.number().nonnegative().default(0.042),
  APP_ORIGIN: optionalSecret.pipe(z.url().optional()),
  CRON_SECRET: optionalSecret,
  DAILY_CRON: z.string().default("15 22 * * 1-5"),
});
export function getEnv() {
  return schema.parse(process.env);
}
export function dataMode() {
  return getEnv().DEMO_MODE ? "demo" : "live";
}
export function requireKey(
  key: "TYPESAFE_API_KEY" | "TWELVE_DATA_API_KEY" | "FINNHUB_API_KEY" | "X_BEARER_TOKEN",
) {
  const value = getEnv()[key];
  if (!value)
    throw new AppError(
      "CONFIGURATION",
      `${key} is missing. Configure it in the server environment.`,
      503,
    );
  return value;
}
