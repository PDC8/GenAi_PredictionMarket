import Link from "next/link";

import { AgentLiveFeed } from "@/components/AgentLiveFeed";
import { AgentRoster } from "@/components/AgentRoster";
import { AllTimePnlChart } from "@/components/AllTimePnlChart";
import { MarketPulse } from "@/components/MarketPulse";
import {
  getAllTimePnlSummary,
  getDailyMetric,
  listAgentRuntimeSummaries,
  listAgents,
  listMarketCards
} from "@/lib/db/repository";
import { epochDaysKey } from "@/lib/db/utils";
import { listRecentPredictionRuns } from "@/lib/orchestrator/pipeline";

export const dynamic = "force-dynamic";
const MIN_MARKET_VOLUME_USD = 0;

export default async function HomePage() {
  const [agents, agentRuntime, markets, runs, metric, pnlSummary] = await Promise.all([
    listAgents(),
    listAgentRuntimeSummaries(),
    listMarketCards({ status: "open", limit: 500 }),
    listRecentPredictionRuns(40),
    getDailyMetric(epochDaysKey(Date.now())),
    getAllTimePnlSummary()
  ]);

  return (
    <main className="page-shell stack">
      <div>
        <h1 className="page-title">Prediction Markets Terminal</h1>
        <p className="page-subtitle">
          Agentic orchestration for forecasting with auditable reasoning, simulation execution, and
          feedback-weighted learning.
        </p>
      </div>

      <div className="row panel">
        <div className="top-metrics-grid">
          <div className="metrics-panel">
            <div className="small">Today&apos;s Metrics</div>
            <div>
              TTFP: <strong>{metric ? `${metric.ttfpSeconds.toFixed(0)}s` : "n/a"}</strong>
            </div>
            <div>
              Unit Economics: <strong>${metric ? metric.unitEconomicsNetAlphaUsd.toFixed(2) : "0.00"}</strong>
            </div>
            <div>
              TCO Delta: <strong>${metric ? metric.tcoDeltaEstimateUsd.toFixed(0) : "1200"}</strong>
            </div>
          </div>

          <AllTimePnlChart
            title="Profit &amp; Loss"
            executions={pnlSummary.executions}
          />

          <div className="top-metrics-action">
            <Link href="/markets" className="badge">
              Open Market Explorer
            </Link>
          </div>
        </div>
      </div>

      <div className="dashboard-stack">
        <AgentRoster agents={agents} runtime={agentRuntime} />
        <div className="grid-2 dashboard-grid dashboard-grid-secondary">
          <AgentLiveFeed agents={agents} runs={runs} />
          <MarketPulse markets={markets} minVolumeUsd={MIN_MARKET_VOLUME_USD} />
        </div>
      </div>
    </main>
  );
}
