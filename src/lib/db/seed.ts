import type { AgentProfile, Market, Signal } from "@/types/domain";

const now = Date.now();

export const demoAgents: AgentProfile[] = [
  {
    id: "agent-macro-alpha",
    name: "Alpha-Macro",
    domain: "Macro",
    riskProfile: "balanced",
    promptTemplate:
      "Focus on macro catalysts, rate expectations, inflation surprises, and signal conflicts.",
    createdAt: now
  },
  {
    id: "agent-event-driven",
    name: "Event-Driven",
    domain: "Politics",
    riskProfile: "aggressive",
    promptTemplate:
      "Prioritize event probability updates and weigh recent primary evidence highest.",
    createdAt: now
  },
  {
    id: "agent-vol-arb",
    name: "Vol-Arb",
    domain: "Crypto",
    riskProfile: "conservative",
    promptTemplate:
      "Prefer conservative allocations unless edge and confidence are both strongly positive.",
    createdAt: now
  }
];

export const seedMarkets: Market[] = [
  {
    id: "mkt-fed-cut-june",
    externalId: "KALSHI-FEDCUT-JUNE",
    title: "Fed rate cut by June 2026?",
    category: "Macro",
    yesPrice: 65,
    noPrice: 35,
    volume: 600564,
    status: "open",
    closeTime: now + 1000 * 60 * 60 * 24 * 75,
    source: "seed_fallback",
    lastSyncedAt: now
  },
  {
    id: "mkt-recession-2026",
    externalId: "KALSHI-RECESSION-2026",
    title: "US recession by end of 2026?",
    category: "Macro",
    yesPrice: 38,
    noPrice: 62,
    volume: 240112,
    status: "open",
    closeTime: now + 1000 * 60 * 60 * 24 * 300,
    source: "seed_fallback",
    lastSyncedAt: now
  },
  {
    id: "mkt-btc-150k-june",
    externalId: "KALSHI-BTC150K-JUNE",
    title: "BTC > $150k by June 2026?",
    category: "Crypto",
    yesPrice: 22,
    noPrice: 78,
    volume: 520000,
    status: "open",
    closeTime: now + 1000 * 60 * 60 * 24 * 110,
    source: "seed_fallback",
    lastSyncedAt: now
  }
];

export const seedSignals: Signal[] = [
  {
    id: "sig-fed-1",
    marketId: "mkt-fed-cut-june",
    sourceName: "Bloomberg",
    signalType: "macro_news",
    polarity: "YES",
    strength: 0.74,
    trustWeight: 1,
    excerpt: "Soft inflation print increased probability of easing cycle.",
    url: "https://example.com/bloomberg-fed-cut",
    timestamp: now - 1000 * 60 * 60 * 3
  },
  {
    id: "sig-fed-2",
    marketId: "mkt-fed-cut-june",
    sourceName: "Reuters",
    signalType: "market_reaction",
    polarity: "YES",
    strength: 0.69,
    trustWeight: 1,
    excerpt: "Treasury yields moved lower after inflation miss.",
    url: "https://example.com/reuters-yields",
    timestamp: now - 1000 * 60 * 90
  },
  {
    id: "sig-recession-1",
    marketId: "mkt-recession-2026",
    sourceName: "BLS",
    signalType: "labor",
    polarity: "NO",
    strength: 0.62,
    trustWeight: 1,
    excerpt: "Labor conditions remain resilient in latest report.",
    url: "https://example.com/bls-report",
    timestamp: now - 1000 * 60 * 60 * 8
  },
  {
    id: "sig-btc-1",
    marketId: "mkt-btc-150k-june",
    sourceName: "OnChain",
    signalType: "flow",
    polarity: "YES",
    strength: 0.55,
    trustWeight: 1,
    excerpt: "Large holder inflow suggests momentum continuation.",
    url: "https://example.com/onchain-flow",
    timestamp: now - 1000 * 60 * 60 * 5
  }
];
