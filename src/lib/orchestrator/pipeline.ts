import { desc } from "drizzle-orm";

import type { Signal, YesNo } from "@/types/domain";
import { db } from "@/lib/db/client";
import { createId, clamp, round, safeJsonParse } from "@/lib/db/utils";
import {
  createPredictionRun,
  getMarketById,
  insertSignals,
  listAgents,
  listRecentFeedbackCorrections,
  listSignalsForMarket
} from "@/lib/db/repository";
import { predictionRuns } from "@/lib/db/schema";
import { estimateProbabilityWithLlm } from "./llm";

interface SignalInput {
  sourceName: string;
  polarity: "YES" | "NO" | "NEUTRAL";
  strength: number;
  trustWeight: number;
}

interface Recommendation {
  side: YesNo | null;
  sizeUsd: number;
}

function signalDirection(polarity: "YES" | "NO" | "NEUTRAL"): number {
  if (polarity === "YES") {
    return 1;
  }
  if (polarity === "NO") {
    return -1;
  }
  return 0;
}

export function blendProbability(deterministic: number, llm: number | null): number {
  if (llm === null) {
    return round(clamp(deterministic, 0.01, 0.99), 4);
  }
  return round(clamp(deterministic * 0.75 + llm * 0.25, 0.01, 0.99), 4);
}

export function computeDeterministicProbability(baseYesPrice: number, signals: SignalInput[]): number {
  const base = clamp(baseYesPrice / 100, 0.01, 0.99);
  const adjustment = signals.reduce((sum, signal) => {
    return sum + signalDirection(signal.polarity) * signal.strength * signal.trustWeight * 0.08;
  }, 0);

  return round(clamp(base + adjustment, 0.01, 0.99), 4);
}

function stddev(values: number[]): number {
  if (values.length <= 1) {
    return 0;
  }

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export function computeConfidence(signals: SignalInput[], marketLastSyncedAt: number, yesPrice: number): number {
  const signed = signals.map((signal) => signalDirection(signal.polarity) * signal.strength * signal.trustWeight);
  const dispersion = stddev(signed);
  const consensus = clamp(1 - dispersion, 0, 1);

  const ageMs = Date.now() - marketLastSyncedAt;
  const freshness = clamp(1 - ageMs / (1000 * 60 * 60 * 24), 0, 1);
  const volatilityPenalty = clamp(Math.abs(yesPrice - 50) / 80, 0, 1);
  const evidenceCompleteness = clamp(signals.length / 8, 0, 1);

  const confidence =
    0.35 + consensus * 0.35 + freshness * 0.15 + evidenceCompleteness * 0.15 - volatilityPenalty * 0.1;

  return round(clamp(confidence, 0.2, 0.95), 4);
}

export function chooseRecommendation(
  probabilityYes: number,
  confidence: number,
  edge: number,
  bankrollUsd: number
): Recommendation {
  if (confidence < 0.62 || edge < 0.04) {
    return { side: null, sizeUsd: 0 };
  }

  const side: YesNo = probabilityYes >= 0.5 ? "YES" : "NO";
  const cap = bankrollUsd * 0.05;
  const kellyLike = clamp(edge * Math.max(0, confidence - 0.5) * 2, 0.005, 0.05);
  const sizeUsd = round(Math.min(cap, bankrollUsd * kellyLike), 2);

  return {
    side,
    sizeUsd
  };
}

function buildSyntheticSignals(input: {
  marketId: string;
  yesPrice: number;
  volume: number;
  category: string;
}): Signal[] {
  const now = Date.now();
  const momentum = Math.abs(input.yesPrice - 50) / 50;
  const volumeStrength = clamp(Math.log10(Math.max(input.volume, 1)) / 6, 0.25, 0.9);

  return [
    {
      id: createId("sig"),
      marketId: input.marketId,
      sourceName: "Kalshi Market Tape",
      signalType: "implied_probability",
      polarity: input.yesPrice >= 50 ? "YES" : "NO",
      strength: round(clamp(0.45 + momentum * 0.5, 0.35, 0.9), 4),
      trustWeight: 1,
      excerpt: "Market-implied probability trend from live order book snapshots.",
      url: "https://trading-api.kalshi.com/",
      timestamp: now
    },
    {
      id: createId("sig"),
      marketId: input.marketId,
      sourceName: "Volume Regime",
      signalType: "liquidity_quality",
      polarity: "NEUTRAL",
      strength: round(volumeStrength, 4),
      trustWeight: 1,
      excerpt: `Observed volume regime for ${input.category} market supports confidence scaling.`,
      url: "internal://volume-regime",
      timestamp: now - 20_000
    },
    {
      id: createId("sig"),
      marketId: input.marketId,
      sourceName: "System Prior",
      signalType: "historical_prior",
      polarity: input.yesPrice >= 50 ? "YES" : "NO",
      strength: round(clamp(0.35 + momentum * 0.3, 0.25, 0.7), 4),
      trustWeight: 1,
      excerpt: "Fallback structured prior generated when external evidence is sparse.",
      url: "internal://system-prior",
      timestamp: now - 40_000
    }
  ];
}

function buildTrustOverrides(
  corrections: Array<{ trustAdjustmentsJson: string }>
): Map<string, number> {
  const map = new Map<string, number>();

  for (const row of corrections) {
    const parsed = safeJsonParse<Record<string, { after: number }>>(row.trustAdjustmentsJson, {});
    for (const [source, value] of Object.entries(parsed)) {
      if (typeof value?.after === "number") {
        map.set(source, value.after);
      }
    }
  }

  return map;
}

export async function runPrediction(input: {
  marketId: string;
  agentId: string;
  useLlm?: boolean;
}) {
  const market = await getMarketById(input.marketId);
  if (!market) {
    throw new Error("market_not_found");
  }

  const agents = await listAgents();
  const agent = agents.find((row) => row.id === input.agentId);
  if (!agent) {
    throw new Error("agent_not_found");
  }

  const stepLogs: Array<{ step: string; status: string; detail: string; ts: number }> = [];
  const pushStep = (step: string, detail: string, status = "completed"): void => {
    stepLogs.push({ step, detail, status, ts: Date.now() });
  };

  pushStep("Plan & Reason", `Built structured query for ${market.title}.`);

  let marketSignals = await listSignalsForMarket(market.id);
  if (marketSignals.length === 0) {
    const syntheticSignals = buildSyntheticSignals({
      marketId: market.id,
      yesPrice: market.yesPrice,
      volume: market.volume,
      category: market.category
    });

    await insertSignals(syntheticSignals);
    marketSignals = syntheticSignals;
    pushStep("Knowledge Engine", "Generated fallback synthetic signals from market tape.");
  } else {
    pushStep("Knowledge Engine", `Loaded ${marketSignals.length} recent trust-weighted signals.`);
  }

  const corrections = await listRecentFeedbackCorrections(100);
  const overrides = buildTrustOverrides(corrections);

  const signalsWithOverrides = marketSignals.map((signal) => ({
    ...signal,
    trustWeight: overrides.get(signal.sourceName) ?? signal.trustWeight
  }));

  pushStep("Tool Selection", "Selected Kalshi snapshot + internal signal store.");

  const deterministicProbability = computeDeterministicProbability(
    market.yesPrice,
    signalsWithOverrides.map((signal) => ({
      sourceName: signal.sourceName,
      polarity: signal.polarity as "YES" | "NO" | "NEUTRAL",
      strength: signal.strength,
      trustWeight: signal.trustWeight
    }))
  );

  const llmProbability = await estimateProbabilityWithLlm({
    market: {
      title: market.title,
      category: market.category,
      yesPrice: market.yesPrice
    },
    signals: signalsWithOverrides,
    useLlm: Boolean(input.useLlm)
  });

  const probabilityYes = blendProbability(deterministicProbability, llmProbability);
  pushStep(
    "Prediction Model Selection",
    llmProbability === null
      ? "Deterministic engine only (LLM unavailable or disabled)."
      : "Blended deterministic and LLM probabilities (0.75 / 0.25)."
  );

  const confidence = computeConfidence(
    signalsWithOverrides.map((signal) => ({
      sourceName: signal.sourceName,
      polarity: signal.polarity as "YES" | "NO" | "NEUTRAL",
      strength: signal.strength,
      trustWeight: signal.trustWeight
    })),
    market.lastSyncedAt,
    market.yesPrice
  );

  const implied = market.yesPrice / 100;
  const edge = round(Math.abs(probabilityYes - implied), 4);
  const opportunitySignal = round(edge * confidence, 4);

  const bankroll = Number(process.env.DEMO_BANKROLL_USD ?? "10000");
  const recommendation = chooseRecommendation(probabilityYes, confidence, edge, bankroll);

  pushStep(
    "Capital Allocation",
    recommendation.side
      ? `Recommended ${recommendation.side} with $${recommendation.sizeUsd.toFixed(2)} based on threshold policy.`
      : "No trade recommendation; confidence/edge below thresholds."
  );

  const rationale =
    `Probability YES=${(probabilityYes * 100).toFixed(1)}%, confidence=${(confidence * 100).toFixed(
      1
    )}%. ` +
    `Edge vs implied=${(edge * 100).toFixed(1)}pp. ` +
    `Top drivers: ${signalsWithOverrides
      .slice(0, 3)
      .map((signal) => `${signal.sourceName}(${signal.polarity}, w=${signal.trustWeight.toFixed(2)})`)
      .join(", ")}.`;

  const runId = createId("run");
  const now = Date.now();

  const reasoningGraph = {
    nodes: [
      { id: market.id, label: market.title, type: "market" },
      { id: agent.id, label: agent.name, type: "agent" },
      ...signalsWithOverrides.map((signal) => ({
        id: signal.id,
        label: signal.sourceName,
        type: "signal",
        polarity: signal.polarity,
        weight: signal.trustWeight
      }))
    ],
    edges: signalsWithOverrides.map((signal) => ({
      source: signal.id,
      target: market.id,
      relation: signal.polarity
    }))
  };

  const estCostUsd = round(0.012 + signalsWithOverrides.length * 0.001 + (llmProbability ? 0.02 : 0), 4);
  const expectedAlphaUsd = round(recommendation.sizeUsd * edge * Math.max(confidence, 0.5), 4);

  const run = await createPredictionRun({
    id: runId,
    marketId: market.id,
    agentId: agent.id,
    probabilityYes,
    confidence,
    opportunitySignal,
    recommendedSide: recommendation.side,
    recommendedSizeUsd: recommendation.sizeUsd,
    rationale,
    reasoningGraphJson: JSON.stringify(reasoningGraph),
    stepLogsJson: JSON.stringify(stepLogs),
    inputSnapshotJson: JSON.stringify({
      market,
      signals: signalsWithOverrides,
      policy: {
        confidenceThreshold: 0.62,
        edgeThreshold: 0.04,
        blend: llmProbability === null ? "deterministic-only" : "0.75 deterministic / 0.25 llm"
      }
    }),
    estCostUsd,
    expectedAlphaUsd,
    createdAt: now
  });

  pushStep("Auditability", "Persisted step logs, evidence snapshot, and reasoning graph.");

  return {
    ...run,
    stepLogs,
    llmProbability,
    deterministicProbability
  };
}

export async function listRecentPredictionRuns(limit = 15) {
  return db.select().from(predictionRuns).orderBy(desc(predictionRuns.createdAt)).limit(limit);
}
