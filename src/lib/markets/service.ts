import { createId } from "@/lib/db/utils";
import { seedMarkets } from "@/lib/db/seed";
import { fetchKalshiMarkets } from "@/lib/kalshi/client";
import { upsertMarkets } from "@/lib/db/repository";

export async function syncMarketsFromKalshi(limit = 50): Promise<{
  synced: number;
  source: "kalshi" | "seed_fallback";
}> {
  try {
    const snapshots = await fetchKalshiMarkets(limit);
    const now = Date.now();

    if (snapshots.length === 0) {
      throw new Error("empty_kalshi_payload");
    }

    await upsertMarkets(
      snapshots.map((item) => ({
        id: createId("mkt"),
        externalId: item.externalId,
        title: item.title,
        category: item.category,
        yesPrice: item.yesPrice,
        noPrice: item.noPrice,
        volume: item.volume,
        status: item.status,
        closeTime: item.closeTime,
        source: "kalshi" as const,
        lastSyncedAt: now
      }))
    );

    return { synced: snapshots.length, source: "kalshi" };
  } catch {
    const now = Date.now();
    await upsertMarkets(
      seedMarkets.map((market) => ({
        ...market,
        id: market.id,
        source: "seed_fallback" as const,
        lastSyncedAt: now
      }))
    );

    return { synced: seedMarkets.length, source: "seed_fallback" };
  }
}
