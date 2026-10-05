ALTER TABLE "Analysis" ADD COLUMN "requestedModel" TEXT;
CREATE TABLE "AiProviderConfig" (
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "encryptedApiKey" TEXT NOT NULL,
    "keySuffix" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AiProviderConfig_pkey" PRIMARY KEY ("provider"),
    CONSTRAINT "AiProviderConfig_provider_check" CHECK ("provider" IN ('jev', 'openai', 'deepseek', 'anthropic'))
);
CREATE TABLE "AiSettings" (
    "id" TEXT NOT NULL DEFAULT 'workspace',
    "defaultProvider" TEXT NOT NULL DEFAULT 'jev',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AiSettings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AiSettings_workspace_check" CHECK ("id" = 'workspace'),
    CONSTRAINT "AiSettings_provider_check" CHECK ("defaultProvider" IN ('jev', 'openai', 'deepseek', 'anthropic'))
);
