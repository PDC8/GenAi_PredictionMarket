import Link from "next/link";

import { ActiveOrchestration } from "@/components/ActiveOrchestration";
import { AgentRoster } from "@/components/AgentRoster";
import { MarketPulse } from "@/components/MarketPulse";
import { getDailyMetric, listAgents, listMarketCards } from "@/lib/db/repository";
import { epochDaysKey } from "@/lib/db/utils";
import { listRecentPredictionRuns } from "@/lib/orchestrator/pipeline";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [agents, markets, runs, metric] = await Promise.all([
    listAgents(),
    listMarketCards({ status: "open", limit: 50 }),
    listRecentPredictionRuns(1),
    getDailyMetric(epochDaysKey(Date.now()))
  ]);

  const latestRun = runs[0] ?? null;

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
        <div>
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
        <Link href="/markets" className="badge">
          Open Market Explorer
        </Link>
      </div>

      <div className="grid-3 dashboard-grid">
        <AgentRoster agents={agents} />
        <ActiveOrchestration latestRun={latestRun} />
        <MarketPulse markets={markets} />
      </div>
    </main>
  );
}
