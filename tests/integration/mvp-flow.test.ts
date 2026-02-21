import { initializeDatabase } from "@/lib/db/init";
import {
  getLatestFeedbackCorrectionForMarket,
  getLatestPredictionRunForMarket,
  listAgents,
  listExecutionsForMarket,
  listMarketCards,
  listSignalsForMarket,
  upsertMarkets
} from "@/lib/db/repository";
import { createSimulatedExecution, recordResolutionAndSettle } from "@/lib/execution/service";
import { generateFeedbackCorrection } from "@/lib/evaluator/feedback";
import { runPrediction } from "@/lib/orchestrator/pipeline";

describe("mvp backend flow", () => {
  it("upserts market snapshots", async () => {
    await initializeDatabase();

    const now = Date.now();
    await upsertMarkets([
      {
        id: "mkt-integration-1",
        externalId: "INT-EXT-1",
        title: "Integration Market",
        category: "Test",
        yesPrice: 41,
        noPrice: 59,
        volume: 12345,
        status: "open",
        closeTime: now + 1000 * 60 * 60,
        source: "seed_fallback",
        lastSyncedAt: now
      }
    ]);

    await upsertMarkets([
      {
        id: "mkt-integration-1-updated",
        externalId: "INT-EXT-1",
        title: "Integration Market",
        category: "Test",
        yesPrice: 61,
        noPrice: 39,
        volume: 45678,
        status: "open",
        closeTime: now + 1000 * 60 * 120,
        source: "seed_fallback",
        lastSyncedAt: now
      }
    ]);

    const markets = await listMarketCards({ limit: 200 });
    const target = markets.find((row) => row.title === "Integration Market");

    expect(target).toBeDefined();
    expect(target?.yesPrice).toBe(61);
  });

  it("creates prediction with rationale and persisted signals", async () => {
    await initializeDatabase();

    const [agent] = await listAgents();
    const [market] = await listMarketCards({ status: "open", limit: 1 });

    const run = await runPrediction({
      marketId: market.id,
      agentId: agent.id,
      useLlm: false
    });

    const storedRun = await getLatestPredictionRunForMarket(market.id);
    const signals = await listSignalsForMarket(market.id);

    expect(run.rationale.length).toBeGreaterThan(20);
    expect(storedRun?.id).toBe(run.id);
    expect(signals.length).toBeGreaterThan(0);
  });

  it("settles executions and produces feedback correction after resolution", async () => {
    await initializeDatabase();

    const [agent] = await listAgents();
    const [market] = await listMarketCards({ status: "open", limit: 1 });

    const run = await runPrediction({ marketId: market.id, agentId: agent.id });

    await createSimulatedExecution({
      predictionRunId: run.id,
      side: "YES",
      sizeUsd: 120
    });

    await recordResolutionAndSettle({ marketId: market.id, outcome: "NO" });
    await generateFeedbackCorrection(market.id);

    const executions = await listExecutionsForMarket(market.id);
    const correction = await getLatestFeedbackCorrectionForMarket(market.id);

    expect(executions.length).toBeGreaterThan(0);
    expect(executions.every((row) => row.status === "CLOSED")).toBe(true);
    expect(correction?.marketId).toBe(market.id);
  });
});
