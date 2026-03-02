import type { MarketCard } from "@/types/domain";

export type MarketPulseSport = "all" | "basketball" | "tennis" | "football" | "other";

export interface MarketPulseEventSide {
  label: string;
  price: number;
  marketId: string;
}

export interface MarketPulseEventCard {
  eventKey: string;
  title: string;
  sport: MarketPulseSport;
  volume: number;
  marketCount: number;
  sideA: MarketPulseEventSide;
  sideB: MarketPulseEventSide;
}

function normalizeToken(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function inferSport(market: MarketCard): MarketPulseSport {
  const value = `${market.externalId} ${market.title} ${market.category}`.toUpperCase();
  if (/(NBA|NCAAB|WNBA|BASKETBALL|POINTS|SPREAD)/.test(value)) {
    return "basketball";
  }
  if (/(ATP|WTA|TENNIS|SET WINNER|QUALIFICATION ROUND|CHALLENGER)/.test(value)) {
    return "tennis";
  }
  if (/(NFL|FOOTBALL|SOCCER|EPL|MLB|NHL|NCAAF)/.test(value)) {
    return "football";
  }
  return "other";
}

function eventKeyFromExternalId(externalId: string): string | null {
  const parts = externalId.split("-");
  if (parts.length < 2) {
    return null;
  }
  return parts.slice(0, -1).join("-");
}

function extractOutcomeLabel(title: string): string | null {
  const winner = title.match(/^Will\s+(.+?)\s+win\b/i)?.[1];
  if (winner) {
    return winner.trim();
  }
  return null;
}

function titleFromSides(sideA: MarketPulseEventSide, sideB: MarketPulseEventSide): string {
  return `${sideA.label} vs ${sideB.label}`;
}

function toFallbackEvent(market: MarketCard): MarketPulseEventCard {
  return {
    eventKey: market.id,
    title: market.title,
    sport: inferSport(market),
    volume: market.volume,
    marketCount: 1,
    sideA: {
      label: "YES",
      price: market.yesPrice,
      marketId: market.id
    },
    sideB: {
      label: "NO",
      price: market.noPrice,
      marketId: market.id
    }
  };
}

export function buildMarketPulseEventCards(markets: MarketCard[]): MarketPulseEventCard[] {
  const allMarkets = [...markets];
  const grouped = new Map<string, MarketCard[]>();

  for (const market of allMarkets) {
    if (!/^Will\s+.+\s+win\b/i.test(market.title)) {
      continue;
    }
    const key = eventKeyFromExternalId(market.externalId);
    if (!key) {
      continue;
    }
    const list = grouped.get(key) ?? [];
    list.push(market);
    grouped.set(key, list);
  }

  const pairedMarketIds = new Set<string>();
  const paired: MarketPulseEventCard[] = [];

  for (const [eventKey, rows] of grouped.entries()) {
    const sides = new Map<string, MarketPulseEventSide>();
    let totalVolume = 0;

    for (const row of rows) {
      const label = extractOutcomeLabel(row.title);
      if (!label) {
        continue;
      }
      totalVolume += row.volume;
      pairedMarketIds.add(row.id);
      if (!sides.has(label)) {
        sides.set(label, { label, price: row.yesPrice, marketId: row.id });
      }
    }

    if (sides.size !== 2) {
      continue;
    }

    const [a, b] = [...sides.values()];
    const normalizedA = normalizeToken(a.label);
    const normalizedB = normalizeToken(b.label);
    if (!normalizedA || !normalizedB || normalizedA === normalizedB) {
      continue;
    }

    const [sideA, sideB] = a.price >= b.price ? [a, b] : [b, a];
    paired.push({
      eventKey,
      title: titleFromSides(sideA, sideB),
      sport: inferSport(rows[0]),
      volume: totalVolume,
      marketCount: rows.length,
      sideA,
      sideB
    });
  }

  const unpaired = allMarkets
    .filter((market) => !pairedMarketIds.has(market.id))
    .sort((a, b) => b.volume - a.volume)
    .map((market) => toFallbackEvent(market));

  return [...paired, ...unpaired].sort((a, b) => b.volume - a.volume);
}

export function formatMarketOdds(pricePct: number): string {
  const implied = Math.max(1, Math.min(99, pricePct));
  return `${(100 / implied).toFixed(2)}x`;
}
