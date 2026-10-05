import "server-only";
import { db } from "@/db/client";
import { AppError } from "@/lib/errors";
import {
  aiProviders,
  aiProviderSchema,
  providerUpdateSchema,
  type AiProvider,
  type AiSettingsView,
} from "@/lib/ai/config";
import { getEnv } from "./env";
import { decryptApiKey, encryptApiKey, encryptionReady } from "./key-encryption";

export type EngineConfiguration = { provider: AiProvider; model: string; apiKey: string };
export async function getAiSettings(): Promise<AiSettingsView> {
  const [settings, configurations] = await Promise.all([
    db.aiSettings.findUnique({ where: { id: "workspace" } }),
    db.aiProviderConfig.findMany({ select: { provider: true, model: true, keySuffix: true } }),
  ]);
  const env = getEnv();
  return {
    defaultProvider: aiProviderSchema.parse(settings?.defaultProvider ?? "jev"),
    canStoreKeys: encryptionReady() && (env.APP_PASSWORD?.length ?? 0) >= 16,
    demo: env.DEMO_MODE,
    providers: aiProviderSchema.options.map((provider) => {
      const stored = configurations.find((row) => row.provider === provider);
      const environmentKey = provider === "jev" && !!env.TYPESAFE_API_KEY;
      return {
        provider,
        model:
          stored?.model ?? (provider === "jev" ? env.TYPESAFE_MODEL : aiProviders[provider].model),
        configured: !!stored || environmentKey,
        ready: stored ? encryptionReady() && (env.APP_PASSWORD?.length ?? 0) >= 16 : environmentKey,
        keySource: stored ? "database" : environmentKey ? "environment" : null,
        keySuffix: stored?.keySuffix ?? null,
      };
    }),
  };
}
function requireProtectedSettings() {
  if ((getEnv().APP_PASSWORD?.length ?? 0) < 16)
    throw new AppError(
      "CONFIGURATION",
      "Set APP_PASSWORD to at least 16 characters before managing API keys.",
      503,
    );
}
export async function getEngineConfiguration(selected?: AiProvider): Promise<EngineConfiguration> {
  const settings = selected ? null : await db.aiSettings.findUnique({ where: { id: "workspace" } });
  const provider = selected ?? aiProviderSchema.parse(settings?.defaultProvider ?? "jev");
  const saved = await db.aiProviderConfig.findUnique({ where: { provider } });
  if (saved) {
    requireProtectedSettings();
    return { provider, model: saved.model, apiKey: decryptApiKey(provider, saved.encryptedApiKey) };
  }
  const env = getEnv();
  if (provider === "jev" && env.TYPESAFE_API_KEY)
    return { provider, model: env.TYPESAFE_MODEL, apiKey: env.TYPESAFE_API_KEY };
  throw new AppError(
    "CONFIGURATION",
    `Add an API key for ${aiProviders[provider].label} in AI settings before analyzing.`,
    503,
  );
}
export async function saveProvider(value: unknown) {
  requireProtectedSettings();
  const { provider, model, apiKey } = providerUpdateSchema.parse(value);
  if (apiKey) {
    const encryptedApiKey = encryptApiKey(provider, apiKey);
    const keySuffix = apiKey.slice(-4);
    await db.aiProviderConfig.upsert({
      where: { provider },
      create: { provider, model, encryptedApiKey, keySuffix },
      update: { model, encryptedApiKey, keySuffix },
    });
  } else {
    const existing = await db.aiProviderConfig.findUnique({
      where: { provider },
      select: { provider: true },
    });
    if (!existing)
      throw new AppError(
        "INVALID_INPUT",
        "Enter an API key when configuring a provider for the first time.",
        400,
      );
    await db.aiProviderConfig.update({ where: { provider }, data: { model } });
  }
}
export async function setDefaultProvider(provider: AiProvider) {
  requireProtectedSettings();
  await getEngineConfiguration(provider);
  await db.aiSettings.upsert({
    where: { id: "workspace" },
    create: { id: "workspace", defaultProvider: provider },
    update: { defaultProvider: provider },
  });
}
export async function deleteProvider(provider: AiProvider) {
  requireProtectedSettings();
  await db.$transaction(async (tx) => {
    await tx.aiProviderConfig.deleteMany({ where: { provider } });
    await tx.aiSettings.updateMany({
      where: { id: "workspace", defaultProvider: provider },
      data: { defaultProvider: "jev" },
    });
  });
}
