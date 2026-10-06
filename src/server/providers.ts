import "server-only";
import { ExternalGateway } from "./external";
import { getEnv } from "./env";
import { TwelveDataMarketProvider } from "@/lib/market/twelve-data";
import { FinnhubNewsProvider } from "@/lib/news/finnhub";
import { JevDecisionEngine } from "@/lib/jev/analyze";
import { XSocialProvider } from "@/lib/social/x";
import {
  DemoDecisionEngine,
  DemoMarketProvider,
  DemoNewsProvider,
  DemoFinancialReportsProvider,
  DemoSocialProvider,
} from "@/lib/demo/providers";
import { SecFinancialReportsProvider } from "@/lib/financials/sec";
import { AiDecisionEngine } from "@/lib/ai/analyze";
import type { EngineConfiguration } from "./ai-settings";

export function createProviders(
  symbol: string,
  runId?: string,
  configuration?: EngineConfiguration,
) {
  const gateway = new ExternalGateway(symbol, runId);
  return getEnv().DEMO_MODE
    ? {
        market: new DemoMarketProvider(),
        news: new DemoNewsProvider(),
        financials: new DemoFinancialReportsProvider(),
        engine: new DemoDecisionEngine(),
        social: new DemoSocialProvider(),
      }
    : {
        market: new TwelveDataMarketProvider(gateway),
        news: new FinnhubNewsProvider(gateway),
        financials: new SecFinancialReportsProvider(gateway),
        engine:
          configuration && configuration.provider !== "jev"
            ? new AiDecisionEngine(gateway, configuration)
            : new JevDecisionEngine(gateway, configuration),
        ...(getEnv().X_BEARER_TOKEN ? { social: new XSocialProvider(gateway) } : {}),
      };
}
