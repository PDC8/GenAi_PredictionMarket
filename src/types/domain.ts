export type MarketStatus = "open" | "closed" | "resolved";
export type YesNo = "YES" | "NO";

export interface AgentProfile {
  id: string;
  name: string;
  domain: string;
  riskProfile: "conservative" | "balanced" | "aggressive";
  promptTemplate: string;
  createdAt: number;
}

export interface Market {
  id: string;
  externalId: string;
  title: string;
  category: string;
  yesPrice: number;
  noPrice: number;
  volume: number;
  status: MarketStatus;
  closeTime: number;
  source: "kalshi" | "seed_fallback";
  lastSyncedAt: number;
}

export interface Signal {
  id: string;
  marketId: string;
  sourceName: string;
  signalType: string;
  polarity: YesNo | "NEUTRAL";
  strength: number;
  trustWeight: number;
  excerpt: string;
  url: string;
  timestamp: number;
}

export interface PredictionRun {
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
}

export interface Execution {
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
}

export interface FeedbackCorrection {
  id: string;
  marketId: string;
  predictionRunId: string;
  errorType: "missed_signals" | "overweighted_signals" | "calibration_error" | "calibrated";
  correctionSummary: string;
  trustAdjustmentsJson: string;
  createdAt: number;
}

export interface ToolStatus {
  tool: string;
  type: "source" | "model" | "action";
  status: "active" | "paused" | "waiting";
  lastAction: string;
}

export interface MarketCard {
  id: string;
  title: string;
  category: string;
  yesPrice: number;
  noPrice: number;
  volume: number;
  status: MarketStatus;
  opportunitySignal: number;
  confidence: number | null;
  source: "kalshi" | "seed_fallback";
  updatedAt: number;
}
