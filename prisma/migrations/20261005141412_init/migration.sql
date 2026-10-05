-- CreateEnum
CREATE TYPE "TradingDecision" AS ENUM ('BUY', 'HOLD', 'SELL');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "Ticker" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "exchange" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ticker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Analysis" (
    "id" TEXT NOT NULL,
    "tickerId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "decision" "TradingDecision" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "summary" TEXT NOT NULL,
    "bullishFactors" JSONB NOT NULL,
    "bearishFactors" JSONB NOT NULL,
    "risks" JSONB NOT NULL,
    "marketDataSnapshot" JSONB NOT NULL,
    "newsSnapshot" JSONB NOT NULL,
    "analysisInput" JSONB NOT NULL,
    "engineOutput" JSONB NOT NULL,
    "engine" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "rubricVersion" TEXT NOT NULL,
    "dataMode" TEXT NOT NULL,
    "analysisDay" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Analysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalysisRun" (
    "id" TEXT NOT NULL,
    "tickerId" TEXT NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'RUNNING',
    "stage" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "dataMode" TEXT NOT NULL,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "warnings" JSONB NOT NULL DEFAULT '[]',
    "context" JSONB,
    "rawOutput" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "AnalysisRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderCache" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderCache_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "ApiUsage" (
    "id" TEXT NOT NULL,
    "runId" TEXT,
    "symbol" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "dataMode" TEXT NOT NULL,
    "cached" BOOLEAN NOT NULL DEFAULT false,
    "success" BOOLEAN NOT NULL,
    "attempt" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "estimatedCostUsd" DOUBLE PRECISION,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitBucket" (
    "key" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "Ticker_symbol_key" ON "Ticker"("symbol");

-- CreateIndex
CREATE UNIQUE INDEX "Analysis_runId_key" ON "Analysis"("runId");

-- CreateIndex
CREATE INDEX "Analysis_tickerId_dataMode_createdAt_idx" ON "Analysis"("tickerId", "dataMode", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Analysis_tickerId_dataMode_analysisDay_idx" ON "Analysis"("tickerId", "dataMode", "analysisDay");

-- CreateIndex
CREATE INDEX "AnalysisRun_tickerId_dataMode_startedAt_idx" ON "AnalysisRun"("tickerId", "dataMode", "startedAt" DESC);

-- CreateIndex
CREATE INDEX "AnalysisRun_status_expiresAt_idx" ON "AnalysisRun"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "ProviderCache_expiresAt_idx" ON "ProviderCache"("expiresAt");

-- CreateIndex
CREATE INDEX "ApiUsage_dataMode_createdAt_idx" ON "ApiUsage"("dataMode", "createdAt");

-- CreateIndex
CREATE INDEX "ApiUsage_runId_idx" ON "ApiUsage"("runId");

-- CreateIndex
CREATE INDEX "ApiUsage_symbol_createdAt_idx" ON "ApiUsage"("symbol", "createdAt");

-- AddForeignKey
ALTER TABLE "Analysis" ADD CONSTRAINT "Analysis_tickerId_fkey" FOREIGN KEY ("tickerId") REFERENCES "Ticker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Analysis" ADD CONSTRAINT "Analysis_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AnalysisRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisRun" ADD CONSTRAINT "AnalysisRun_tickerId_fkey" FOREIGN KEY ("tickerId") REFERENCES "Ticker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiUsage" ADD CONSTRAINT "ApiUsage_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AnalysisRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
