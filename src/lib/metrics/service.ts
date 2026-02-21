import { epochDaysKey, round } from "@/lib/db/utils";
import {
  getDailyMetric,
  getExecutionCostAndPnlForDate,
  upsertDailyMetric
} from "@/lib/db/repository";

const processBootTime = Date.now();

export async function recordPredictionMetrics(): Promise<void> {
  const date = epochDaysKey(Date.now());
  const existing = await getDailyMetric(date);

  const ttfpSeconds = existing
    ? existing.ttfpSeconds
    : Math.max(1, Math.floor((Date.now() - processBootTime) / 1000));

  const economics = await getExecutionCostAndPnlForDate(date);
  const unitEconomicsNetAlphaUsd = round(economics.pnl - economics.estCosts, 4);

  await upsertDailyMetric({
    date,
    ttfpSeconds,
    unitEconomicsNetAlphaUsd,
    tcoDeltaEstimateUsd: 1200
  });
}

export async function refreshUnitEconomicsMetric(): Promise<void> {
  const date = epochDaysKey(Date.now());
  const existing = await getDailyMetric(date);
  const economics = await getExecutionCostAndPnlForDate(date);

  await upsertDailyMetric({
    date,
    ttfpSeconds: existing?.ttfpSeconds ?? Math.max(1, Math.floor((Date.now() - processBootTime) / 1000)),
    unitEconomicsNetAlphaUsd: round(economics.pnl - economics.estCosts, 4),
    tcoDeltaEstimateUsd: existing?.tcoDeltaEstimateUsd ?? 1200
  });
}
