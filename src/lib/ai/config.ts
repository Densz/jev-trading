import { z } from "zod";
import { analysisOptionsSchema as socialAnalysisOptionsSchema } from "@/types/social";

export const aiProviderSchema = z.enum(["jev", "openai", "deepseek", "anthropic"]);
export type AiProvider = z.infer<typeof aiProviderSchema>;
export const aiProviders = {
  jev: { label: "Jev", model: "jev-1.13.0", models: ["jev-1.13.0"] },
  openai: {
    label: "OpenAI",
    model: "gpt-4.1-mini",
    models: ["gpt-4.1-mini", "gpt-4.1", "gpt-4o-mini"],
  },
  deepseek: {
    label: "DeepSeek",
    model: "deepseek-chat",
    models: ["deepseek-chat", "deepseek-reasoner"],
  },
  anthropic: {
    label: "Claude (Anthropic)",
    model: "claude-sonnet-4-5-20250929",
    models: ["claude-sonnet-4-5-20250929", "claude-haiku-4-5-20251001"],
  },
} satisfies Record<AiProvider, { label: string; model: string; models: string[] }>;
export const modelSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9._:-]+$/, "Enter a valid model ID.");
export const providerUpdateSchema = z
  .object({
    provider: aiProviderSchema,
    model: modelSchema,
    apiKey: z
      .string()
      .trim()
      .min(8)
      .max(512)
      .regex(/^[!-~]+$/, "API keys cannot contain spaces or control characters.")
      .optional(),
  })
  .strict();
export const providerSelectionSchema = z.object({ provider: aiProviderSchema }).strict();
export const analysisOptionsSchema = socialAnalysisOptionsSchema.extend({
  provider: aiProviderSchema.optional(),
});
export type AiSettingsView = {
  defaultProvider: AiProvider;
  canStoreKeys: boolean;
  demo: boolean;
  providers: {
    provider: AiProvider;
    model: string;
    configured: boolean;
    ready: boolean;
    keySource: "database" | "environment" | null;
    keySuffix: string | null;
  }[];
};
