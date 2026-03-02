import type { AgentProfile } from "@/types/domain";
import { safeJsonParse } from "@/lib/db/utils";

interface FeedRun {
  id: string;
  agentId: string;
  probabilityYes: number;
  confidence: number;
  recommendedSide: string | null;
  recommendedSizeUsd: number;
  inputSnapshotJson: string;
  rationale: string;
  createdAt: number;
}

interface AgentLiveFeedProps {
  agents: AgentProfile[];
  runs: FeedRun[];
}

function relativeTimeLabel(epochMs: number): string {
  const diffMs = Math.max(0, Date.now() - epochMs);
  const diffSeconds = Math.floor(diffMs / 1000);
  if (diffSeconds < 60) {
    return `${diffSeconds}s ago`;
  }

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function marketTitleFromSnapshot(raw: string): string {
  const parsed = safeJsonParse<{ market?: { title?: string } }>(raw, {});
  return parsed.market?.title?.trim() || "Unknown market";
}

export function AgentLiveFeed({ agents, runs }: AgentLiveFeedProps) {
  const agentNameById = new Map(agents.map((agent) => [agent.id, agent.name]));

  return (
    <div className="panel stack dashboard-panel">
      <div className="row">
        <h2>Agent Live Feed</h2>
        <span className="badge">{runs.length} updates</span>
      </div>
      <div className="small">Recent model activity across your agent roster.</div>

      <div className="stack panel-scroll">
        {runs.length === 0 ? (
          <div className="small">No updates yet. Run a prediction to start the live feed.</div>
        ) : (
          runs.slice(0, 40).map((run) => {
            const agentName = agentNameById.get(run.agentId) ?? "Unknown agent";
            const marketTitle = marketTitleFromSnapshot(run.inputSnapshotJson);
            const actionLabel =
              run.recommendedSide === "YES" || run.recommendedSide === "NO"
                ? `ACT ${run.recommendedSide} $${run.recommendedSizeUsd.toFixed(0)}`
                : "OBS NO TRADE";

            return (
              <div className="feed-item" key={run.id}>
                <div className="row">
                  <strong>{agentName}</strong>
                  <span className="small">{relativeTimeLabel(run.createdAt)}</span>
                </div>
                <div className="small">{marketTitle}</div>
                <div className="feed-signal-row">
                  <span className="feed-action">{actionLabel}</span>
                  <span className="small">P(YES) {(run.probabilityYes * 100).toFixed(1)}%</span>
                  <span className="small">Conf {(run.confidence * 100).toFixed(0)}%</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
