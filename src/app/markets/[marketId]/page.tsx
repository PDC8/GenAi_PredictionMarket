import Link from "next/link";
import { notFound } from "next/navigation";

import { MarketActions } from "@/components/MarketActions";
import {
  getLatestFeedbackCorrectionForMarket,
  getLatestPredictionRunForMarket,
  getMarketById,
  getResolutionForMarket,
  listAgents,
  listExecutionsForMarket,
  listSignalsForMarket
} from "@/lib/db/repository";
import { safeJsonParse } from "@/lib/db/utils";

export const dynamic = "force-dynamic";

export default async function MarketDetailPage({
  params
}: {
  params: Promise<{ marketId: string }>;
}) {
  const { marketId } = await params;

  const [market, agents, latestRun, signals, executions, resolution, correction] = await Promise.all([
    getMarketById(marketId),
    listAgents(),
    getLatestPredictionRunForMarket(marketId),
    listSignalsForMarket(marketId),
    listExecutionsForMarket(marketId),
    getResolutionForMarket(marketId),
    getLatestFeedbackCorrectionForMarket(marketId)
  ]);

  if (!market) {
    notFound();
  }

  const stepLogs = safeJsonParse<Array<{ step: string; detail: string; status: string }>>(
    latestRun?.stepLogsJson ?? "[]",
    []
  );

  const reasoningGraph = safeJsonParse<Record<string, unknown>>(latestRun?.reasoningGraphJson ?? "{}", {});

  return (
    <main className="page-shell stack">
      <div className="row">
        <div>
          <h1 className="page-title">{market.title}</h1>
          <p className="page-subtitle">
            {market.category} | Source: {market.source} | Status: {market.status}
          </p>
        </div>
        <Link href="/" className="badge">
          Back to Dashboard
        </Link>
      </div>

      <div className="grid-3">
        <div className="panel stack">
          <h3>Contract Snapshot</h3>
          <div className="row">
            <span>YES</span>
            <strong>{market.yesPrice.toFixed(1)}%</strong>
          </div>
          <div className="row">
            <span>NO</span>
            <strong>{market.noPrice.toFixed(1)}%</strong>
          </div>
          <div className="row">
            <span>Volume</span>
            <strong>${market.volume.toLocaleString()}</strong>
          </div>
          <div className="row">
            <span>Close Time</span>
            <strong>{new Date(market.closeTime).toLocaleString()}</strong>
          </div>

          <hr />

          <h3>Forecast</h3>
          {latestRun ? (
            <>
              <div className="row">
                <span>Probability (YES)</span>
                <strong>{(latestRun.probabilityYes * 100).toFixed(1)}%</strong>
              </div>
              <div className="row">
                <span>Confidence</span>
                <strong>{(latestRun.confidence * 100).toFixed(1)}%</strong>
              </div>
              <div className="row">
                <span>Opportunity</span>
                <strong>{(latestRun.opportunitySignal * 100).toFixed(1)}%</strong>
              </div>
              <div className="row">
                <span>Recommendation</span>
                <strong>{latestRun.recommendedSide ?? "NO TRADE"}</strong>
              </div>
              <div className="small">{latestRun.rationale}</div>
            </>
          ) : (
            <div className="small">Run prediction to generate a forecast.</div>
          )}
        </div>

        <div className="panel stack">
          <h3>Why It Moved</h3>
          <div className="small">Evidence timeline and source attribution.</div>
          <div className="stack">
            {signals.map((signal) => (
              <div className="item" key={signal.id}>
                <div className="row">
                  <strong>{signal.sourceName}</strong>
                  <span className="badge">{signal.polarity}</span>
                </div>
                <div className="small">{signal.excerpt}</div>
                <div className="row small">
                  <span>Strength {signal.strength.toFixed(2)}</span>
                  <span>Trust {signal.trustWeight.toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>

          <hr />

          <h3>Orchestration Steps</h3>
          <table>
            <thead>
              <tr>
                <th>Step</th>
                <th>Status</th>
                <th>Output</th>
              </tr>
            </thead>
            <tbody>
              {stepLogs.map((step, index) => (
                <tr key={`${step.step}-${index}`}>
                  <td>{step.step}</td>
                  <td>{step.status}</td>
                  <td>{step.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3>Reasoning Graph</h3>
          <pre>{JSON.stringify(reasoningGraph, null, 2)}</pre>
        </div>

        <MarketActions
          marketId={market.id}
          agents={agents}
          latestRunId={latestRun?.id ?? null}
          defaultSizeUsd={latestRun?.recommendedSizeUsd ?? 50}
        />
      </div>

      <div className="grid-3">
        <div className="panel stack">
          <h3>Simulated Positions</h3>
          <table>
            <thead>
              <tr>
                <th>Side</th>
                <th>Size</th>
                <th>Entry</th>
                <th>Status</th>
                <th>PnL</th>
              </tr>
            </thead>
            <tbody>
              {executions.map((execution) => (
                <tr key={execution.id}>
                  <td>{execution.side}</td>
                  <td>${execution.sizeUsd.toFixed(2)}</td>
                  <td>{(execution.entryPrice * 100).toFixed(1)}%</td>
                  <td>{execution.status}</td>
                  <td className={execution.pnlUsd >= 0 ? "good" : "bad"}>${execution.pnlUsd.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="panel stack">
          <h3>Resolution</h3>
          {resolution ? (
            <>
              <div>
                Outcome: <strong>{resolution.outcome}</strong>
              </div>
              <div className="small">Resolved at {new Date(resolution.resolvedAt).toLocaleString()}</div>
            </>
          ) : (
            <div className="small">Not resolved.</div>
          )}
        </div>

        <div className="panel stack">
          <h3>Correction Report</h3>
          {correction ? (
            <>
              <div>
                Type: <span className="badge">{correction.errorType}</span>
              </div>
              <div className="small">{correction.correctionSummary}</div>
              <pre>{correction.trustAdjustmentsJson}</pre>
            </>
          ) : (
            <div className="small">Generate after market resolution.</div>
          )}
        </div>
      </div>
    </main>
  );
}
