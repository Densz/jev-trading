import "server-only";
import { ExternalGateway } from "./external";
import { getEnv } from "./env";
import { TwelveDataMarketProvider } from "@/lib/market/twelve-data";
import { FinnhubNewsProvider } from "@/lib/news/finnhub";
import { JevDecisionEngine } from "@/lib/jev/analyze";
import { DemoDecisionEngine, DemoMarketProvider, DemoNewsProvider } from "@/lib/demo/providers";

export function createProviders(symbol: string, runId?: string) {
  const gateway = new ExternalGateway(symbol, runId);
  return getEnv().DEMO_MODE
    ? {
        market: new DemoMarketProvider(),
        news: new DemoNewsProvider(),
        engine: new DemoDecisionEngine(),
      }
    : {
        market: new TwelveDataMarketProvider(gateway),
        news: new FinnhubNewsProvider(gateway),
        engine: new JevDecisionEngine(gateway),
      };
}
