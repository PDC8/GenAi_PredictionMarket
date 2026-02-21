import cron from "node-cron";

import { generateFeedbackCorrection } from "@/lib/evaluator/feedback";
import { syncMarketsFromKalshi } from "@/lib/markets/service";
import { recordPredictionMetrics, refreshUnitEconomicsMetric } from "@/lib/metrics/service";
import { runPrediction } from "@/lib/orchestrator/pipeline";
import {
  getLatestFeedbackCorrectionForMarket,
  getLatestPredictionRunForMarket,
  getResolutionForMarket,
  listAgents,
  listMarketCards
} from "@/lib/db/repository";
import { initializeDatabase } from "@/lib/db/init";

async function runSafe(label: string, job: () => Promise<void>): Promise<void> {
  try {
    await job();
  } catch (error) {
    console.error(`[worker:${label}]`, error);
  }
}

async function syncTask(): Promise<void> {
  const result = await syncMarketsFromKalshi(50);
  console.log(`[worker:sync] source=${result.source} synced=${result.synced}`);
}

async function predictionTask(): Promise<void> {
  const [agents, openMarkets] = await Promise.all([
    listAgents(),
    listMarketCards({ status: "open", limit: 8 })
  ]);

  const agent = agents[0];
  if (!agent) {
    return;
  }

  for (const market of openMarkets.slice(0, 4)) {
    const latestRun = await getLatestPredictionRunForMarket(market.id);
    const isStale = !latestRun || Date.now() - latestRun.createdAt > 1000 * 60 * 30;

    if (!isStale) {
      continue;
    }

    await runPrediction({ marketId: market.id, agentId: agent.id, useLlm: false });
    console.log(`[worker:predict] market=${market.id} agent=${agent.id}`);
  }

  await recordPredictionMetrics();
}

async function feedbackTask(): Promise<void> {
  const resolvedMarkets = await listMarketCards({ status: "resolved", limit: 20 });

  for (const market of resolvedMarkets) {
    const [resolution, correction] = await Promise.all([
      getResolutionForMarket(market.id),
      getLatestFeedbackCorrectionForMarket(market.id)
    ]);

    if (!resolution || correction) {
      continue;
    }

    await generateFeedbackCorrection(market.id);
    console.log(`[worker:feedback] market=${market.id}`);
  }

  await refreshUnitEconomicsMetric();
}

async function bootstrap(): Promise<void> {
  await initializeDatabase();

  await runSafe("sync-initial", syncTask);
  await runSafe("prediction-initial", predictionTask);
  await runSafe("feedback-initial", feedbackTask);

  cron.schedule("*/5 * * * *", () => {
    void runSafe("sync", syncTask);
  });

  cron.schedule("*/10 * * * *", () => {
    void runSafe("prediction", predictionTask);
  });

  cron.schedule("*/2 * * * *", () => {
    void runSafe("feedback", feedbackTask);
  });

  console.log("[worker] running cron loop");
}

void bootstrap();
