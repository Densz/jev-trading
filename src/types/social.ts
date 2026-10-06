import { z } from "zod";

export const DEFAULT_TWEET_LIMIT = 10;
export const MAX_TWEET_LIMIT = 100;
export const MAX_SOCIAL_CONTEXT_POSTS = 10;
export const DEFAULT_PROFILE_LOOKUP_LIMIT = 3;
export const tweetLimitSchema = z
  .number()
  .int()
  .min(0)
  .max(MAX_TWEET_LIMIT)
  .refine((value) => value === 0 || value >= 10, "Choose 0 to disable X, or 10-100 posts.");
export const analysisOptionsSchema = z
  .object({
    force: z.boolean().default(false),
    tweetLimit: tweetLimitSchema.optional(),
    includeAuthorProfiles: z.boolean().optional(),
  })
  .strict();
export const socialAuthorSchema = z.object({
  id: z.string().regex(/^\d{1,19}$/),
  username: z.string().regex(/^[A-Za-z0-9_]{1,15}$/),
  name: z.string().min(1).max(200),
  description: z.string().max(1000),
  createdAt: z.iso.datetime().nullable(),
  website: z
    .url()
    .max(2048)
    .refine((value) => /^https?:\/\//.test(value))
    .nullable(),
  followers: z.number().int().nonnegative().nullable(),
  fetchedAt: z.iso.datetime(),
});
export const socialPostSchema = z.object({
  id: z.string().regex(/^\d{1,19}$/),
  authorId: z
    .string()
    .regex(/^\d{1,19}$/)
    .nullable(),
  text: z.string().min(1).max(1000),
  publishedAt: z.iso.datetime(),
  url: z.url().refine((value) => /^https:\/\/x\.com\//.test(value)),
  likes: z.number().int().nonnegative().nullable(),
  reposts: z.number().int().nonnegative().nullable(),
});
export const socialContextSchema = z.object({
  provider: z.enum(["x", "synthetic"]),
  status: z.enum(["available", "disabled", "unavailable"]),
  requestedLimit: tweetLimitSchema,
  fetchedCount: z.number().int().min(0).max(MAX_TWEET_LIMIT),
  fetchedAt: z.iso.datetime().nullable(),
  posts: z.array(socialPostSchema).max(MAX_SOCIAL_CONTEXT_POSTS),
  authors: z.array(socialAuthorSchema).max(MAX_SOCIAL_CONTEXT_POSTS).optional(),
  authorProfilesMessage: z.string().max(500).optional(),
  message: z.string().max(500).optional(),
});
export type SocialPost = z.infer<typeof socialPostSchema>;
export type SocialAuthor = z.infer<typeof socialAuthorSchema>;
export type SocialContext = z.infer<typeof socialContextSchema>;
export type SocialCollection = Pick<
  SocialContext,
  "fetchedCount" | "fetchedAt" | "posts" | "authors" | "authorProfilesMessage"
>;
export interface SocialProvider {
  readonly provider: "x" | "synthetic";
  getPosts(
    symbol: string,
    companyName: string,
    limit: number,
    options?: { includeAuthorProfiles?: boolean },
  ): Promise<SocialCollection>;
}
export type SocialConfiguration = {
  demo: boolean;
  xEnabled: boolean;
  defaultTweetLimit: number;
  xPostReadCostUsd: number;
  xProfileReadCostUsd: number;
  xProfileLookupLimit: number;
  xProfileCacheDays: number;
};
