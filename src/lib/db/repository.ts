import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";

import type {
  AgentProfile,
  AgentRuntimeSummary,
  FeedbackCorrection,
  MarketCard,
  MarketStatus,
  YesNo
} from "@/types/domain";
import { initializeDatabase } from "./init";
import { createId, round } from "./utils";
import { db } from "./client";
import {
  agentRuntime,
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

function deriveAgentStatus(manualStatus: "live" | "paused", lastPredictionAt: number | null): AgentRuntimeSummary["status"] {
  if (manualStatus === "paused") {
    return "PAUSED";
  }
  return lastPredictionAt === null ? "PENDING" : "LIVE";
}

export async function listAgentRuntimeSummaries(agentIds?: string[]): Promise<AgentRuntimeSummary[]> {
  await initializeDatabase();

  const targetAgents =
    agentIds && agentIds.length > 0
      ? await db.select({ id: agents.id }).from(agents).where(inArray(agents.id, agentIds))
      : await db.select({ id: agents.id }).from(agents);

  const ids = targetAgents.map((row) => row.id);
  if (ids.length === 0) {
    return [];
  }

  const runtimeRows = await db.select().from(agentRuntime).where(inArray(agentRuntime.agentId, ids));
  const runtimeByAgentId = new Map(runtimeRows.map((row) => [row.agentId, row]));

  const runRows = await db
    .select({
      id: predictionRuns.id,
      agentId: predictionRuns.agentId,
      createdAt: predictionRuns.createdAt
    })
    .from(predictionRuns)
    .where(inArray(predictionRuns.agentId, ids));

  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

  const perAgent = new Map<
    string,
    {
      lastPredictionAt: number | null;
      predictions30d: number;
      closedExecutions: number;
      winningExecutions: number;
      netAlpha: number;
    }
  >();
  for (const agentId of ids) {
    perAgent.set(agentId, {
      lastPredictionAt: null,
      predictions30d: 0,
      closedExecutions: 0,
      winningExecutions: 0,
      netAlpha: 0
    });
  }

  const runIdToAgentId = new Map<string, string>();
  for (const run of runRows) {
    runIdToAgentId.set(run.id, run.agentId);
    const stats = perAgent.get(run.agentId);
    if (!stats) {
      continue;
    }
    if (stats.lastPredictionAt === null || run.createdAt > stats.lastPredictionAt) {
      stats.lastPredictionAt = run.createdAt;
    }
    if (run.createdAt >= thirtyDaysAgo) {
      stats.predictions30d += 1;
    }
  }

  const runIds = [...runIdToAgentId.keys()];
  if (runIds.length > 0) {
    const closedExecutions = await db
      .select({
        predictionRunId: executions.predictionRunId,
        pnlUsd: executions.pnlUsd
      })
      .from(executions)
      .where(and(eq(executions.status, "CLOSED"), inArray(executions.predictionRunId, runIds)));

    for (const execution of closedExecutions) {
      const agentId = runIdToAgentId.get(execution.predictionRunId);
      if (!agentId) {
        continue;
      }
      const stats = perAgent.get(agentId);
      if (!stats) {
        continue;
      }
      stats.closedExecutions += 1;
      if (execution.pnlUsd > 0) {
        stats.winningExecutions += 1;
      }
      stats.netAlpha = round(stats.netAlpha + execution.pnlUsd, 4);
    }
  }

  return ids.map((agentId) => {
    const runtime = runtimeByAgentId.get(agentId);
    const manualStatus: "live" | "paused" = runtime?.manualStatus === "paused" ? "paused" : "live";
    const stats = perAgent.get(agentId) ?? {
      lastPredictionAt: null,
      predictions30d: 0,
      closedExecutions: 0,
      winningExecutions: 0,
      netAlpha: 0
    };

    const winRate =
      stats.closedExecutions > 0 ? round((stats.winningExecutions / stats.closedExecutions) * 100, 1) : null;

    return {
      agentId,
      manualStatus,
      status: deriveAgentStatus(manualStatus, stats.lastPredictionAt),
      winRate,
      netAlpha: stats.closedExecutions > 0 ? stats.netAlpha : null,
      lastPredictionAt: stats.lastPredictionAt,
      predictions30d: stats.predictions30d
    };
  });
}

export async function getAgentRuntimeSummary(agentId: string): Promise<AgentRuntimeSummary | null> {
  const rows = await listAgentRuntimeSummaries([agentId]);
  return rows[0] ?? null;
}

export async function setAgentManualStatus(input: {
  agentId: string;
  manualStatus: "live" | "paused";
}): Promise<{ status: "updated" | "not_found" }> {
  await initializeDatabase();

  const foundAgent = await db.select({ id: agents.id }).from(agents).where(eq(agents.id, input.agentId)).limit(1);
  if (foundAgent.length === 0) {
    return { status: "not_found" };
  }

  const now = Date.now();
  await db
    .insert(agentRuntime)
    .values({
      agentId: input.agentId,
      manualStatus: input.manualStatus,
      statusUpdatedAt: now
    })
    .onConflictDoUpdate({
      target: agentRuntime.agentId,
      set: {
        manualStatus: input.manualStatus,
        statusUpdatedAt: now
      }
    });

  return { status: "updated" };
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

export async function updateAgentById(input: {
  agentId: string;
  name: string;
  domain: string;
  riskProfile: "conservative" | "balanced" | "aggressive";
  promptTemplate: string;
}): Promise<AgentProfile | null> {
  await initializeDatabase();

  const foundAgent = await db.select({ id: agents.id }).from(agents).where(eq(agents.id, input.agentId)).limit(1);
  if (foundAgent.length === 0) {
    return null;
  }

  await db
    .update(agents)
    .set({
      name: input.name,
      domain: input.domain,
      riskProfile: input.riskProfile,
      promptTemplate: input.promptTemplate
    })
    .where(eq(agents.id, input.agentId));

  const updatedRows = await db.select().from(agents).where(eq(agents.id, input.agentId)).limit(1);
  const updatedAgent = updatedRows[0];
  if (!updatedAgent) {
    return null;
  }

  return {
    ...updatedAgent,
    riskProfile:
      updatedAgent.riskProfile === "conservative" || updatedAgent.riskProfile === "aggressive"
        ? updatedAgent.riskProfile
        : "balanced"
  };
}

export async function deleteAgentById(
  agentId: string
): Promise<{ status: "deleted" | "not_found" | "in_use" }> {
  await initializeDatabase();

  const foundAgent = await db.select({ id: agents.id }).from(agents).where(eq(agents.id, agentId)).limit(1);
  if (foundAgent.length === 0) {
    return { status: "not_found" };
  }

  const linkedRun = await db
    .select({ id: predictionRuns.id })
    .from(predictionRuns)
    .where(eq(predictionRuns.agentId, agentId))
    .limit(1);

  if (linkedRun.length > 0) {
    return { status: "in_use" };
  }

  await db.delete(agents).where(eq(agents.id, agentId));
  return { status: "deleted" };
}

function looksLikeMultiLegMarket(input: {
  externalId: string;
  title: string;
  category: string;
}): boolean {
  const structural = `${input.externalId} ${input.category}`.toUpperCase();
  if (/(CROSSCATEGORY|MULTIGAME|PARLAY|SAMEGAME|SGP)/.test(structural)) {
    return true;
  }

  const yesNoHits = (input.title.match(/\b(yes|no)\b/gi) ?? []).length;
  return input.title.includes(",") && yesNoHits >= 2;
}

export async function listMarketCards(params?: {
  status?: MarketStatus;
  limit?: number;
  minVolume?: number;
}): Promise<MarketCard[]> {
  await initializeDatabase();
  const status = params?.status;
  const limit = params?.limit ?? 50;
  const minVolume = params?.minVolume;

  let marketRows: Array<typeof markets.$inferSelect>;
  if (status && minVolume !== undefined) {
    marketRows = await db
      .select()
      .from(markets)
      .where(and(eq(markets.status, status), gt(markets.volume, minVolume)))
      .orderBy(desc(markets.volume))
      .limit(limit);
  } else if (status) {
    marketRows = await db
      .select()
      .from(markets)
      .where(eq(markets.status, status))
      .orderBy(desc(markets.volume))
      .limit(limit);
  } else if (minVolume !== undefined) {
    marketRows = await db.select().from(markets).where(gt(markets.volume, minVolume)).orderBy(desc(markets.volume)).limit(limit);
  } else {
    marketRows = await db.select().from(markets).orderBy(desc(markets.volume)).limit(limit);
  }

  const filteredRows = marketRows.filter(
    (market) =>
      !looksLikeMultiLegMarket({
        externalId: market.externalId,
        title: market.title,
        category: market.category
      })
  );

  const runs = await db.select().from(predictionRuns).orderBy(desc(predictionRuns.createdAt));

  const latestByMarket = new Map<string, (typeof runs)[number]>();
  for (const run of runs) {
    if (!latestByMarket.has(run.marketId)) {
      latestByMarket.set(run.marketId, run);
    }
  }

  return filteredRows.map((market) => {
    const run = latestByMarket.get(market.id);
    return {
      id: market.id,
      externalId: market.externalId,
      title: market.title,
      category: market.category,
      yesPrice: market.yesPrice,
      noPrice: market.noPrice,
      volume: market.volume,
      status: market.status as MarketStatus,
      opportunitySignal: run?.opportunitySignal ?? null,
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

export async function getAllTimePnlSummary(): Promise<{
  totalPnlUsd: number;
  closedExecutions: number;
  winningExecutions: number;
  losingExecutions: number;
  points: Array<{ timestamp: number; cumulativePnlUsd: number }>;
  executions: Array<{ timestamp: number; pnlUsd: number }>;
}> {
  await initializeDatabase();

  const closed = await db
    .select({
      createdAt: executions.createdAt,
      pnlUsd: executions.pnlUsd
    })
    .from(executions)
    .where(eq(executions.status, "CLOSED"))
    .orderBy(executions.createdAt);

  let cumulative = 0;
  let wins = 0;
  let losses = 0;

  const points = closed.map((row) => {
    cumulative = round(cumulative + row.pnlUsd, 4);
    if (row.pnlUsd > 0) {
      wins += 1;
    } else if (row.pnlUsd < 0) {
      losses += 1;
    }
    return {
      timestamp: row.createdAt,
      cumulativePnlUsd: cumulative
    };
  });

  return {
    totalPnlUsd: round(cumulative, 4),
    closedExecutions: closed.length,
    winningExecutions: wins,
    losingExecutions: losses,
    points,
    executions: closed.map((row) => ({ timestamp: row.createdAt, pnlUsd: row.pnlUsd }))
  };
}
