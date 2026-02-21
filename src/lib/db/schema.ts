import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const agents = sqliteTable("agents", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  domain: text("domain").notNull(),
  riskProfile: text("risk_profile").notNull(),
  promptTemplate: text("prompt_template").notNull(),
  createdAt: integer("created_at").notNull()
});

export const markets = sqliteTable("markets", {
  id: text("id").primaryKey(),
  externalId: text("external_id").notNull().unique(),
  title: text("title").notNull(),
  category: text("category").notNull(),
  yesPrice: real("yes_price").notNull(),
  noPrice: real("no_price").notNull(),
  volume: real("volume").notNull(),
  status: text("status").notNull(),
  closeTime: integer("close_time").notNull(),
  source: text("source").notNull(),
  lastSyncedAt: integer("last_synced_at").notNull()
});

export const signals = sqliteTable("signals", {
  id: text("id").primaryKey(),
  marketId: text("market_id").notNull(),
  sourceName: text("source_name").notNull(),
  signalType: text("signal_type").notNull(),
  polarity: text("polarity").notNull(),
  strength: real("strength").notNull(),
  trustWeight: real("trust_weight").notNull(),
  excerpt: text("excerpt").notNull(),
  url: text("url").notNull(),
  timestamp: integer("timestamp").notNull()
});

export const predictionRuns = sqliteTable("prediction_runs", {
  id: text("id").primaryKey(),
  marketId: text("market_id").notNull(),
  agentId: text("agent_id").notNull(),
  probabilityYes: real("probability_yes").notNull(),
  confidence: real("confidence").notNull(),
  opportunitySignal: real("opportunity_signal").notNull(),
  recommendedSide: text("recommended_side"),
  recommendedSizeUsd: real("recommended_size_usd").notNull(),
  rationale: text("rationale").notNull(),
  reasoningGraphJson: text("reasoning_graph_json").notNull(),
  stepLogsJson: text("step_logs_json").notNull(),
  inputSnapshotJson: text("input_snapshot_json").notNull(),
  estCostUsd: real("est_cost_usd").notNull(),
  expectedAlphaUsd: real("expected_alpha_usd").notNull(),
  createdAt: integer("created_at").notNull()
});

export const executions = sqliteTable("executions", {
  id: text("id").primaryKey(),
  predictionRunId: text("prediction_run_id").notNull(),
  marketId: text("market_id").notNull(),
  side: text("side").notNull(),
  sizeUsd: real("size_usd").notNull(),
  entryPrice: real("entry_price").notNull(),
  mode: text("mode").notNull(),
  status: text("status").notNull(),
  pnlUsd: real("pnl_usd").notNull(),
  createdAt: integer("created_at").notNull()
});

export const resolutions = sqliteTable("resolutions", {
  id: text("id").primaryKey(),
  marketId: text("market_id").notNull().unique(),
  outcome: text("outcome").notNull(),
  resolvedAt: integer("resolved_at").notNull()
});

export const feedbackCorrections = sqliteTable("feedback_corrections", {
  id: text("id").primaryKey(),
  marketId: text("market_id").notNull(),
  predictionRunId: text("prediction_run_id").notNull(),
  errorType: text("error_type").notNull(),
  correctionSummary: text("correction_summary").notNull(),
  trustAdjustmentsJson: text("trust_adjustments_json").notNull(),
  createdAt: integer("created_at").notNull()
});

export const metricsDaily = sqliteTable("metrics_daily", {
  date: text("date").primaryKey(),
  ttfpSeconds: real("ttfp_seconds").notNull(),
  unitEconomicsNetAlphaUsd: real("unit_economics_net_alpha_usd").notNull(),
  tcoDeltaEstimateUsd: real("tco_delta_estimate_usd").notNull()
});
