import { db, sqliteClient } from "./client";
import { demoAgents, seedMarkets, seedSignals } from "./seed";
import { agents, markets, signals } from "./schema";

let initialized = false;
let initializing: Promise<void> | null = null;

function createTables(): void {
  sqliteClient.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      domain TEXT NOT NULL,
      risk_profile TEXT NOT NULL,
      prompt_template TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS markets (
      id TEXT PRIMARY KEY,
      external_id TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      yes_price REAL NOT NULL,
      no_price REAL NOT NULL,
      volume REAL NOT NULL,
      status TEXT NOT NULL,
      close_time INTEGER NOT NULL,
      source TEXT NOT NULL,
      last_synced_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS signals (
      id TEXT PRIMARY KEY,
      market_id TEXT NOT NULL,
      source_name TEXT NOT NULL,
      signal_type TEXT NOT NULL,
      polarity TEXT NOT NULL,
      strength REAL NOT NULL,
      trust_weight REAL NOT NULL,
      excerpt TEXT NOT NULL,
      url TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      FOREIGN KEY (market_id) REFERENCES markets(id)
    );

    CREATE TABLE IF NOT EXISTS prediction_runs (
      id TEXT PRIMARY KEY,
      market_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      probability_yes REAL NOT NULL,
      confidence REAL NOT NULL,
      opportunity_signal REAL NOT NULL,
      recommended_side TEXT,
      recommended_size_usd REAL NOT NULL,
      rationale TEXT NOT NULL,
      reasoning_graph_json TEXT NOT NULL,
      step_logs_json TEXT NOT NULL,
      input_snapshot_json TEXT NOT NULL,
      est_cost_usd REAL NOT NULL,
      expected_alpha_usd REAL NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (market_id) REFERENCES markets(id),
      FOREIGN KEY (agent_id) REFERENCES agents(id)
    );

    CREATE TABLE IF NOT EXISTS executions (
      id TEXT PRIMARY KEY,
      prediction_run_id TEXT NOT NULL,
      market_id TEXT NOT NULL,
      side TEXT NOT NULL,
      size_usd REAL NOT NULL,
      entry_price REAL NOT NULL,
      mode TEXT NOT NULL,
      status TEXT NOT NULL,
      pnl_usd REAL NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (prediction_run_id) REFERENCES prediction_runs(id),
      FOREIGN KEY (market_id) REFERENCES markets(id)
    );

    CREATE TABLE IF NOT EXISTS resolutions (
      id TEXT PRIMARY KEY,
      market_id TEXT NOT NULL UNIQUE,
      outcome TEXT NOT NULL,
      resolved_at INTEGER NOT NULL,
      FOREIGN KEY (market_id) REFERENCES markets(id)
    );

    CREATE TABLE IF NOT EXISTS feedback_corrections (
      id TEXT PRIMARY KEY,
      market_id TEXT NOT NULL,
      prediction_run_id TEXT NOT NULL,
      error_type TEXT NOT NULL,
      correction_summary TEXT NOT NULL,
      trust_adjustments_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (market_id) REFERENCES markets(id),
      FOREIGN KEY (prediction_run_id) REFERENCES prediction_runs(id)
    );

    CREATE TABLE IF NOT EXISTS metrics_daily (
      date TEXT PRIMARY KEY,
      ttfp_seconds REAL NOT NULL,
      unit_economics_net_alpha_usd REAL NOT NULL,
      tco_delta_estimate_usd REAL NOT NULL
    );
  `);
}

export async function initializeDatabase(): Promise<void> {
  if (initialized) {
    return;
  }

  if (initializing) {
    await initializing;
    return;
  }

  initializing = (async () => {
    createTables();

    await db.insert(agents).values(demoAgents).onConflictDoNothing();
    await db.insert(markets).values(seedMarkets).onConflictDoNothing();
    await db.insert(signals).values(seedSignals).onConflictDoNothing();

    initialized = true;
  })()
    .finally(() => {
      initializing = null;
    });

  await initializing;
}
