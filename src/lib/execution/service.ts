import type { YesNo } from "@/types/domain";
import { clamp, createId, round } from "@/lib/db/utils";
import {
  closeExecutionsWithPnl,
  createExecution,
  getMarketById,
  getPredictionRunById,
  listOpenExecutionsForMarket,
  markMarketResolved,
  upsertResolution
} from "@/lib/db/repository";

export async function createSimulatedExecution(input: {
  predictionRunId: string;
  side: YesNo;
  sizeUsd: number;
}) {
  const run = await getPredictionRunById(input.predictionRunId);
  if (!run) {
    throw new Error("prediction_run_not_found");
  }

  const market = await getMarketById(run.marketId);
  if (!market) {
    throw new Error("market_not_found");
  }

  const rawEntryPrice = input.side === "YES" ? market.yesPrice / 100 : market.noPrice / 100;
  const entryPrice = clamp(rawEntryPrice, 0.01, 0.99);

  return createExecution({
    id: createId("exec"),
    predictionRunId: run.id,
    marketId: run.marketId,
    side: input.side,
    sizeUsd: round(input.sizeUsd, 2),
    entryPrice,
    mode: "SIM",
    status: "OPEN",
    pnlUsd: 0,
    createdAt: Date.now()
  });
}

function calculatePnl(input: { side: YesNo; outcome: YesNo; sizeUsd: number; entryPrice: number }): number {
  if (input.side !== input.outcome) {
    return round(-input.sizeUsd, 4);
  }

  const shares = input.sizeUsd / clamp(input.entryPrice, 0.01, 0.99);
  const payout = shares;
  return round(payout - input.sizeUsd, 4);
}

export async function recordResolutionAndSettle(input: { marketId: string; outcome: YesNo }) {
  const market = await getMarketById(input.marketId);
  if (!market) {
    throw new Error("market_not_found");
  }

  await upsertResolution({
    id: createId("res"),
    marketId: market.id,
    outcome: input.outcome,
    resolvedAt: Date.now()
  });

  await markMarketResolved(market.id);

  const openExecutions = await listOpenExecutionsForMarket(market.id);
  const updates = openExecutions.map((execution) => ({
    id: execution.id,
    pnlUsd: calculatePnl({
      side: execution.side as YesNo,
      outcome: input.outcome,
      sizeUsd: execution.sizeUsd,
      entryPrice: execution.entryPrice
    })
  }));

  await closeExecutionsWithPnl(updates);

  return {
    marketId: market.id,
    outcome: input.outcome,
    closedExecutions: updates.length,
    totalPnlUsd: round(updates.reduce((sum, item) => sum + item.pnlUsd, 0), 4)
  };
}
