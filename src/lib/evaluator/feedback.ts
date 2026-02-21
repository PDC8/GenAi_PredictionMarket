import { clamp, createId, safeJsonParse } from "@/lib/db/utils";
import {
  createFeedbackCorrection,
  getLatestPredictionRunForMarket,
  getResolutionForMarket,
  updateSignalTrustBySource
} from "@/lib/db/repository";
import type { YesNo } from "@/types/domain";

interface TrustDeltaResult {
  before: number;
  after: number;
  delta: number;
}

export function applyTrustDelta(before: number, helpful: boolean): TrustDeltaResult {
  const boundedBefore = clamp(before, 0.2, 1.5);
  const delta = helpful ? 0.03 : -0.05;
  const after = clamp(boundedBefore + delta, 0.2, 1.5);
  return {
    before: boundedBefore,
    after,
    delta
  };
}

function chooseErrorType(predicted: YesNo, outcome: YesNo, confidence: number) {
  if (predicted === outcome) {
    return "calibrated" as const;
  }
  if (confidence >= 0.7) {
    return "overweighted_signals" as const;
  }
  if (confidence <= 0.45) {
    return "calibration_error" as const;
  }
  return "missed_signals" as const;
}

export async function generateFeedbackCorrection(marketId: string) {
  const resolution = await getResolutionForMarket(marketId);
  if (!resolution) {
    throw new Error("resolution_not_found");
  }

  const latestRun = await getLatestPredictionRunForMarket(marketId);
  if (!latestRun) {
    throw new Error("prediction_run_not_found");
  }

  const predicted: YesNo = latestRun.probabilityYes >= 0.5 ? "YES" : "NO";
  const outcome = resolution.outcome as YesNo;
  const errorType = chooseErrorType(predicted, outcome, latestRun.confidence);

  const snapshot = safeJsonParse<{ signals?: Array<{ sourceName: string; trustWeight: number; polarity: string }> }>(
    latestRun.inputSnapshotJson,
    {}
  );
  const signals = snapshot.signals ?? [];

  const adjustments: Record<string, { before: number; after: number; delta: number }> = {};

  for (const signal of signals) {
    const polarity = signal.polarity;
    if (polarity !== "YES" && polarity !== "NO") {
      continue;
    }

    const helpful = polarity === outcome;
    const trust = applyTrustDelta(signal.trustWeight ?? 1, helpful);

    adjustments[signal.sourceName] = trust;
    await updateSignalTrustBySource(signal.sourceName, trust.after);
  }

  const correctionSummary =
    predicted === outcome
      ? `Prediction was correct. Calibrated confidence=${latestRun.confidence.toFixed(2)} and reinforced reliable signals.`
      : `Prediction mismatch (${predicted} vs ${outcome}). Applied ${errorType} correction and reweighted source trust.`;

  const correction = await createFeedbackCorrection({
    id: createId("corr"),
    marketId,
    predictionRunId: latestRun.id,
    errorType,
    correctionSummary,
    trustAdjustmentsJson: JSON.stringify(adjustments),
    createdAt: Date.now()
  });

  return {
    ...correction,
    adjustments
  };
}
