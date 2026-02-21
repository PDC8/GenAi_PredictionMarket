import { and, desc, eq, inArray, sql } from "drizzle-orm";

import type { AgentProfile, FeedbackCorrection, MarketCard, MarketStatus, YesNo } from "@/types/domain";
import { initializeDatabase } from "./init";
import { createId } from "./utils";
import { db } from "./client";
import {
  agents,
  executions,
  feedbackCorrections,
  markets,
  metricsDaily,
  predictionRuns,
  resolutions,
  signals
} from "./schema";

export async function listAgents(): Promise<AgentProfile[]> {
  await initializeDatabase();
  const rows = await db.select().from(agents).orderBy(desc(agents.createdAt));
  return rows.map((row) => ({
    ...row,
    riskProfile:
      row.riskProfile === "conservative" || row.riskProfile === "aggressive"
        ? row.riskProfile
        : "balanced"
  }));
}

export async function createAgent(input: {
  name: string;
  domain: string;
  riskProfile: "conservative" | "balanced" | "aggressive";
  promptTemplate: string;
}): Promise<AgentProfile> {
  await initializeDatabase();
  const row = {
    id: createId("agent"),
    ...input,
    createdAt: Date.now()
  };
  await db.insert(agents).values(row);
  return row;
}

export async function listMarketCards(params?: {
  status?: MarketStatus;
  limit?: number;
}): Promise<MarketCard[]> {
  await initializeDatabase();
  const status = params?.status;
  const limit = params?.limit ?? 50;

  const marketRows = status
    ? await db
        .select()
        .from(markets)
        .where(eq(markets.status, status))
        .orderBy(desc(markets.volume))
        .limit(limit)
    : await db.select().from(markets).orderBy(desc(markets.volume)).limit(limit);

  const runs = await db.select().from(predictionRuns).orderBy(desc(predictionRuns.createdAt));

  const latestByMarket = new Map<string, (typeof runs)[number]>();
  for (const run of runs) {
    if (!latestByMarket.has(run.marketId)) {
      latestByMarket.set(run.marketId, run);
    }
  }

  return marketRows.map((market) => {
    const run = latestByMarket.get(market.id);
    return {
      id: market.id,
      title: market.title,
      category: market.category,
      yesPrice: market.yesPrice,
      noPrice: market.noPrice,
      volume: market.volume,
      status: market.status as MarketStatus,
      opportunitySignal: run?.opportunitySignal ?? Math.abs(market.yesPrice / 100 - 0.5),
      confidence: run?.confidence ?? null,
      source: market.source as "kalshi" | "seed_fallback",
      updatedAt: market.lastSyncedAt
    };
  });
}

export async function getMarketById(marketId: string) {
  await initializeDatabase();
  const row = await db.select().from(markets).where(eq(markets.id, marketId)).limit(1);
  return row[0] ?? null;
}

export async function getMarketByExternalId(externalId: string) {
  await initializeDatabase();
  const row = await db.select().from(markets).where(eq(markets.externalId, externalId)).limit(1);
  return row[0] ?? null;
}

export async function upsertMarkets(input: Array<{
  id: string;
  externalId: string;
  title: string;
  category: string;
  yesPrice: number;
  noPrice: number;
  volume: number;
  status: string;
  closeTime: number;
  source: "kalshi" | "seed_fallback";
  lastSyncedAt: number;
}>): Promise<void> {
  await initializeDatabase();
  if (input.length === 0) {
    return;
  }

  await db
    .insert(markets)
    .values(input)
    .onConflictDoUpdate({
      target: markets.externalId,
      set: {
        title: sql`excluded.title`,
        category: sql`excluded.category`,
        yesPrice: sql`excluded.yes_price`,
        noPrice: sql`excluded.no_price`,
        volume: sql`excluded.volume`,
        status: sql`excluded.status`,
        closeTime: sql`excluded.close_time`,
        source: sql`excluded.source`,
        lastSyncedAt: sql`excluded.last_synced_at`
      }
    });
}

export async function listSignalsForMarket(marketId: string) {
  await initializeDatabase();
  return db
    .select()
    .from(signals)
    .where(eq(signals.marketId, marketId))
    .orderBy(desc(signals.timestamp))
    .limit(50);
}

export async function insertSignals(
  input: Array<{
    id: string;
    marketId: string;
    sourceName: string;
    signalType: string;
    polarity: string;
    strength: number;
    trustWeight: number;
    excerpt: string;
    url: string;
    timestamp: number;
  }>
): Promise<void> {
  await initializeDatabase();
  if (input.length === 0) {
    return;
  }
  await db.insert(signals).values(input);
}

export async function getPredictionRunById(predictionRunId: string) {
  await initializeDatabase();
  const row = await db.select().from(predictionRuns).where(eq(predictionRuns.id, predictionRunId)).limit(1);
  return row[0] ?? null;
}

export async function getLatestPredictionRunForMarket(marketId: string) {
  await initializeDatabase();
  const row = await db
    .select()
    .from(predictionRuns)
    .where(eq(predictionRuns.marketId, marketId))
    .orderBy(desc(predictionRuns.createdAt))
    .limit(1);
  return row[0] ?? null;
}

export async function createPredictionRun(input: {
  id: string;
  marketId: string;
  agentId: string;
  probabilityYes: number;
  confidence: number;
  opportunitySignal: number;
  recommendedSide: YesNo | null;
  recommendedSizeUsd: number;
  rationale: string;
  reasoningGraphJson: string;
  stepLogsJson: string;
  inputSnapshotJson: string;
  estCostUsd: number;
  expectedAlphaUsd: number;
  createdAt: number;
}) {
  await initializeDatabase();
  await db.insert(predictionRuns).values(input);
  return input;
}

export async function createExecution(input: {
  id: string;
  predictionRunId: string;
  marketId: string;
  side: YesNo;
  sizeUsd: number;
  entryPrice: number;
  mode: "SIM";
  status: "OPEN" | "CLOSED";
  pnlUsd: number;
  createdAt: number;
}) {
  await initializeDatabase();
  await db.insert(executions).values(input);
  return input;
}

export async function listExecutionsForMarket(marketId: string) {
  await initializeDatabase();
  return db.select().from(executions).where(eq(executions.marketId, marketId)).orderBy(desc(executions.createdAt));
}

export async function listOpenExecutionsForMarket(marketId: string) {
  await initializeDatabase();
  return db
    .select()
    .from(executions)
    .where(and(eq(executions.marketId, marketId), eq(executions.status, "OPEN")));
}

export async function closeExecutionsWithPnl(executionPnls: Array<{ id: string; pnlUsd: number }>): Promise<void> {
  await initializeDatabase();
  for (const item of executionPnls) {
    await db
      .update(executions)
      .set({ status: "CLOSED", pnlUsd: item.pnlUsd })
      .where(eq(executions.id, item.id));
  }
}

export async function upsertResolution(input: {
  id: string;
  marketId: string;
  outcome: YesNo;
  resolvedAt: number;
}) {
  await initializeDatabase();

  await db
    .insert(resolutions)
    .values(input)
    .onConflictDoUpdate({
      target: resolutions.marketId,
      set: {
        outcome: sql`excluded.outcome`,
        resolvedAt: sql`excluded.resolved_at`
      }
    });

  return input;
}

export async function getResolutionForMarket(marketId: string) {
  await initializeDatabase();
  const row = await db.select().from(resolutions).where(eq(resolutions.marketId, marketId)).limit(1);
  return row[0] ?? null;
}

export async function markMarketResolved(marketId: string): Promise<void> {
  await initializeDatabase();
  await db
    .update(markets)
    .set({ status: "resolved", lastSyncedAt: Date.now() })
    .where(eq(markets.id, marketId));
}

export async function createFeedbackCorrection(input: FeedbackCorrection): Promise<FeedbackCorrection> {
  await initializeDatabase();
  await db.insert(feedbackCorrections).values(input);
  return input;
}

export async function getLatestFeedbackCorrectionForMarket(marketId: string) {
  await initializeDatabase();
  const row = await db
    .select()
    .from(feedbackCorrections)
    .where(eq(feedbackCorrections.marketId, marketId))
    .orderBy(desc(feedbackCorrections.createdAt))
    .limit(1);
  return row[0] ?? null;
}

export async function listRecentFeedbackCorrections(limit = 100) {
  await initializeDatabase();
  return db.select().from(feedbackCorrections).orderBy(desc(feedbackCorrections.createdAt)).limit(limit);
}

export async function updateSignalTrustBySource(sourceName: string, trustWeight: number): Promise<void> {
  await initializeDatabase();
  await db.update(signals).set({ trustWeight }).where(eq(signals.sourceName, sourceName));
}

export async function getDailyMetric(date: string) {
  await initializeDatabase();
  const rows = await db.select().from(metricsDaily).where(eq(metricsDaily.date, date)).limit(1);
  return rows[0] ?? null;
}

export async function upsertDailyMetric(input: {
  date: string;
  ttfpSeconds: number;
  unitEconomicsNetAlphaUsd: number;
  tcoDeltaEstimateUsd: number;
}): Promise<void> {
  await initializeDatabase();

  await db
    .insert(metricsDaily)
    .values(input)
    .onConflictDoUpdate({
      target: metricsDaily.date,
      set: {
        ttfpSeconds: input.ttfpSeconds,
        unitEconomicsNetAlphaUsd: input.unitEconomicsNetAlphaUsd,
        tcoDeltaEstimateUsd: input.tcoDeltaEstimateUsd
      }
    });
}

export async function getExecutionCostAndPnlForDate(date: string): Promise<{
  pnl: number;
  estCosts: number;
}> {
  await initializeDatabase();

  const start = Date.parse(`${date}T00:00:00.000Z`);
  const end = start + 1000 * 60 * 60 * 24;

  const closedExecutions = await db
    .select()
    .from(executions)
    .where(
      and(
        eq(executions.status, "CLOSED"),
        sql`${executions.createdAt} >= ${start} AND ${executions.createdAt} < ${end}`
      )
    );

  const runIds = closedExecutions.map((execution) => execution.predictionRunId);

  if (runIds.length === 0) {
    return { pnl: 0, estCosts: 0 };
  }

  const runs = await db.select().from(predictionRuns).where(inArray(predictionRuns.id, runIds));
  const estCosts = runs.reduce((sum, row) => sum + row.estCostUsd, 0);
  const pnl = closedExecutions.reduce((sum, row) => sum + row.pnlUsd, 0);

  return { pnl, estCosts };
}
