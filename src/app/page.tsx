import { Watchlist } from "@/components/watchlist";
import { getWatchlist, publicConfiguration } from "@/server/queries";
export default async function Page() {
  return <Watchlist tickers={await getWatchlist()} config={publicConfiguration()} />;
}
