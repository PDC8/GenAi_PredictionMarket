"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

import type { AgentProfile, AgentRuntimeSummary } from "@/types/domain";

interface AgentRosterProps {
  agents: AgentProfile[];
  runtime: AgentRuntimeSummary[];
}

interface AgentFormState {
  name: string;
  domain: string;
  riskProfile: "conservative" | "balanced" | "aggressive";
  promptTemplate: string;
}

const defaultForm: AgentFormState = {
  name: "",
  domain: "Macro",
  riskProfile: "balanced",
  promptTemplate: "Use trust-weighted evidence and preserve reasoning transparency."
};

type BuilderStep = 1 | 2 | 3 | 4;

interface SourceDefinition {
  id: string;
  label: string;
  kind: string;
  detail: string;
}

interface AgentTelemetry {
  strategy: string;
  status: "LIVE" | "PAUSED" | "PENDING";
  statusClass: "status-live" | "status-paused" | "status-pending";
  winRate: number | null;
  netAlpha: number | null;
  lastPredictionLabel: string;
  predictions30d: number;
}

interface BuilderRules {
  pollIntervalSeconds: number;
  confidenceThreshold: number;
  maxPositionUsd: number;
  maxOpenTrades: number;
}

const availableSources: SourceDefinition[] = [
  { id: "exa_search", label: "Exa AI Neural Search", kind: "News & Web", detail: "Global event retrieval" },
  { id: "polymarket_api", label: "Polymarket API", kind: "Market Data", detail: "Live odds stream (30s)" },
  { id: "kalshi_feed", label: "Kalshi Feed", kind: "Market Data", detail: "Contract prices (60s)" },
  { id: "reddit_sentiment", label: "Reddit Sentiment", kind: "Social", detail: "Subreddit sentiment stream" },
  { id: "fred_macro", label: "FRED Macro Data", kind: "Macro", detail: "CPI, PCE, labor, rates" },
  { id: "drive_docs", label: "My Google Drive", kind: "Private", detail: "Notes and policy docs" }
];

const defaultSourceSelection = ["polymarket_api", "kalshi_feed", "fred_macro"];
const builderMarker = "[Builder Config]";

function statusClassName(status: AgentTelemetry["status"]): AgentTelemetry["statusClass"] {
  return status === "LIVE" ? "status-live" : status === "PAUSED" ? "status-paused" : "status-pending";
}

function relativePredictionLabel(lastPredictionAt: number | null): string {
  if (!lastPredictionAt) {
    return "awaiting first run";
  }

  const diffMs = Math.max(0, Date.now() - lastPredictionAt);
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 1) {
    return "just now";
  }
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

function deriveTelemetry(agent: AgentProfile, runtime?: AgentRuntimeSummary): AgentTelemetry {
  const status: AgentTelemetry["status"] = runtime?.status ?? "PENDING";
  const statusClass = statusClassName(status);

  return {
    strategy: `${agent.domain} + ${agent.riskProfile}`,
    status,
    statusClass,
    winRate: runtime?.winRate ?? null,
    netAlpha: runtime?.netAlpha ?? null,
    lastPredictionLabel: relativePredictionLabel(runtime?.lastPredictionAt ?? null),
    predictions30d: runtime?.predictions30d ?? 0
  };
}

function currency(value: number | null): string {
  if (value === null) {
    return "—";
  }
  const sign = value > 0 ? "+" : "";
  return `${sign}$${Math.abs(value).toFixed(0)}`;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function defaultRules(): BuilderRules {
  return {
    pollIntervalSeconds: 30,
    confidenceThreshold: 0.75,
    maxPositionUsd: 75,
    maxOpenTrades: 3
  };
}

function sourceLabels(sourceIds: string[]): string {
  return sourceIds
    .map((id) => availableSources.find((source) => source.id === id)?.label)
    .filter((label): label is string => Boolean(label))
    .join(", ");
}

function buildPromptTemplate(basePrompt: string, sourceIds: string[], rules: BuilderRules): string {
  const cleaned = basePrompt.trim() || defaultForm.promptTemplate;
  const labels = sourceLabels(sourceIds);

  return [
    cleaned,
    "",
    builderMarker,
    `Source IDs: ${sourceIds.join(",") || "none"}`,
    `Source Labels: ${labels || "none"}`,
    `Execution: poll_seconds=${rules.pollIntervalSeconds}; confidence_threshold=${rules.confidenceThreshold.toFixed(
      2
    )}; max_trade_usd=${rules.maxPositionUsd}; max_open_trades=${rules.maxOpenTrades}`
  ].join("\n");
}

function parsePromptTemplate(promptTemplate: string): {
  basePrompt: string;
  sourceIds: string[];
  rules: BuilderRules;
} {
  const defaults = defaultRules();
  const markerIndex = promptTemplate.indexOf(builderMarker);

  if (markerIndex < 0) {
    return {
      basePrompt: promptTemplate,
      sourceIds: defaultSourceSelection,
      rules: defaults
    };
  }

  const basePrompt = promptTemplate.slice(0, markerIndex).trim();
  const configBlock = promptTemplate.slice(markerIndex);

  let sourceIds = defaultSourceSelection;
  const sourceIdsMatch = configBlock.match(/Source IDs:\s*([^\n]+)/i);
  if (sourceIdsMatch) {
    const parsed = sourceIdsMatch[1]
      .split(",")
      .map((token) => token.trim())
      .filter((token) => token.length > 0 && token.toLowerCase() !== "none")
      .filter((token) => availableSources.some((source) => source.id === token));
    if (parsed.length > 0) {
      sourceIds = parsed;
    }
  } else {
    const legacySourceLine = configBlock.match(/Sources:\s*([^\n]+)/i);
    if (legacySourceLine) {
      const labels = legacySourceLine[1].split(",").map((label) => label.trim().toLowerCase());
      const mapped = availableSources
        .filter((source) => labels.includes(source.label.toLowerCase()))
        .map((source) => source.id);
      if (mapped.length > 0) {
        sourceIds = mapped;
      }
    }
  }

  const rules = { ...defaults };
  const executionLine = configBlock.match(/Execution:\s*([^\n]+)/i)?.[1] ?? "";
  const poll = executionLine.match(/poll_seconds=(\d+)/i)?.[1] ?? executionLine.match(/Poll every\s+(\d+)s/i)?.[1];
  const confidence =
    executionLine.match(/confidence_threshold=([0-9.]+)/i)?.[1] ?? executionLine.match(/threshold\s+([0-9.]+)/i)?.[1];
  const maxTrade =
    executionLine.match(/max_trade_usd=([0-9.]+)/i)?.[1] ?? executionLine.match(/max trade\s+\$?([0-9.]+)/i)?.[1];
  const maxOpen =
    executionLine.match(/max_open_trades=(\d+)/i)?.[1] ?? executionLine.match(/max open\s+(\d+)/i)?.[1];

  if (poll) {
    rules.pollIntervalSeconds = clampNumber(Number(poll), 15, 180);
  }
  if (confidence) {
    rules.confidenceThreshold = clampNumber(Number(confidence), 0.55, 0.95);
  }
  if (maxTrade) {
    rules.maxPositionUsd = clampNumber(Number(maxTrade), 10, 100000);
  }
  if (maxOpen) {
    rules.maxOpenTrades = clampNumber(Number(maxOpen), 1, 20);
  }

  return {
    basePrompt: basePrompt || defaultForm.promptTemplate,
    sourceIds,
    rules
  };
}

export function AgentRoster({ agents, runtime }: AgentRosterProps) {
  const [pending, startTransition] = useTransition();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [builderStep, setBuilderStep] = useState<BuilderStep>(1);
  const [agentList, setAgentList] = useState<AgentProfile[]>(agents);
  const [runtimeByAgentId, setRuntimeByAgentId] = useState<Record<string, AgentRuntimeSummary>>(
    Object.fromEntries(runtime.map((item) => [item.agentId, item]))
  );
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [deletingAgentId, setDeletingAgentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState<AgentFormState>(defaultForm);
  const [editForm, setEditForm] = useState<AgentFormState>(defaultForm);
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>(defaultSourceSelection);
  const [pollIntervalSeconds, setPollIntervalSeconds] = useState(30);
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.75);
  const [maxPositionUsd, setMaxPositionUsd] = useState(75);
  const [maxOpenTrades, setMaxOpenTrades] = useState(3);
  const [editSelectedSourceIds, setEditSelectedSourceIds] = useState<string[]>(defaultSourceSelection);
  const [editPollIntervalSeconds, setEditPollIntervalSeconds] = useState(30);
  const [editConfidenceThreshold, setEditConfidenceThreshold] = useState(0.75);
  const [editMaxPositionUsd, setEditMaxPositionUsd] = useState(75);
  const [editMaxOpenTrades, setEditMaxOpenTrades] = useState(3);

  useEffect(() => {
    setAgentList(agents);
  }, [agents]);

  useEffect(() => {
    setRuntimeByAgentId(Object.fromEntries(runtime.map((item) => [item.agentId, item])));
  }, [runtime]);

  const agentRows = useMemo(
    () =>
      agentList.map((agent) => ({
        agent,
        telemetry: deriveTelemetry(agent, runtimeByAgentId[agent.id])
      })),
    [agentList, runtimeByAgentId]
  );

  const summary = useMemo(() => {
    const activeCount = agentRows.filter((item) => item.telemetry.status === "LIVE").length;
    const winRates = agentRows
      .map((item) => item.telemetry.winRate)
      .filter((value): value is number => typeof value === "number");
    const alphaValues = agentRows
      .map((item) => item.telemetry.netAlpha)
      .filter((value): value is number => typeof value === "number");
    const predictions = agentRows.reduce((sum, item) => sum + item.telemetry.predictions30d, 0);

    const avgWinRate = winRates.length > 0 ? winRates.reduce((sum, value) => sum + value, 0) / winRates.length : 0;
    const avgBrier = winRates.length > 0 ? Math.max(0.05, Math.min(0.35, 1 - avgWinRate / 100)) : 0;
    const netAlpha = alphaValues.reduce((sum, value) => sum + value, 0);

    return {
      activeCount,
      avgBrier,
      netAlpha,
      avgWinRate,
      predictions
    };
  }, [agentRows]);

  const selectedSources = useMemo(
    () => availableSources.filter((source) => selectedSourceIds.includes(source.id)),
    [selectedSourceIds]
  );
  const editSelectedSources = useMemo(
    () => availableSources.filter((source) => editSelectedSourceIds.includes(source.id)),
    [editSelectedSourceIds]
  );

  const canGoNextFromStep1 = createForm.name.trim().length >= 2 && createForm.domain.trim().length >= 2;
  const canGoNextFromStep2 = selectedSourceIds.length > 0;

  function openEditModal(agent: AgentProfile): void {
    setError(null);
    const parsed = parsePromptTemplate(agent.promptTemplate);
    setEditingAgentId(agent.id);
    setEditForm({
      name: agent.name,
      domain: agent.domain,
      riskProfile: agent.riskProfile,
      promptTemplate: parsed.basePrompt
    });
    setEditSelectedSourceIds(parsed.sourceIds);
    setEditPollIntervalSeconds(parsed.rules.pollIntervalSeconds);
    setEditConfidenceThreshold(parsed.rules.confidenceThreshold);
    setEditMaxPositionUsd(parsed.rules.maxPositionUsd);
    setEditMaxOpenTrades(parsed.rules.maxOpenTrades);
    setShowCreateModal(false);
    setShowEditModal(true);
  }

  function closeEditModal(): void {
    setShowEditModal(false);
    setEditingAgentId(null);
    setDeletingAgentId(null);
  }

  function openBuilderModal(): void {
    setError(null);
    setBuilderStep(1);
    setCreateForm(defaultForm);
    setSelectedSourceIds(defaultSourceSelection);
    setPollIntervalSeconds(30);
    setConfidenceThreshold(0.75);
    setMaxPositionUsd(75);
    setMaxOpenTrades(3);
    setShowEditModal(false);
    setShowCreateModal(true);
  }

  function toggleSource(sourceId: string): void {
    setSelectedSourceIds((previous) =>
      previous.includes(sourceId) ? previous.filter((id) => id !== sourceId) : [...previous, sourceId]
    );
  }

  function toggleEditSource(sourceId: string): void {
    setEditSelectedSourceIds((previous) =>
      previous.includes(sourceId) ? previous.filter((id) => id !== sourceId) : [...previous, sourceId]
    );
  }

  function nextStep(): void {
    setBuilderStep((previous) => {
      if (previous === 4) {
        return previous;
      }
      return (previous + 1) as BuilderStep;
    });
  }

  function previousStep(): void {
    setBuilderStep((previous) => {
      if (previous === 1) {
        return previous;
      }
      return (previous - 1) as BuilderStep;
    });
  }

  async function submitCreate(): Promise<void> {
    setError(null);
    startTransition(async () => {
      const enhancedPrompt = buildPromptTemplate(createForm.promptTemplate, selectedSourceIds, {
        pollIntervalSeconds,
        confidenceThreshold,
        maxPositionUsd,
        maxOpenTrades
      });
      const response = await fetch("/api/agents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...createForm,
          promptTemplate: enhancedPrompt
        })
      });

      if (!response.ok) {
        setError("Failed to create agent.");
        return;
      }

      const createdAgent = (await response.json()) as AgentProfile;
      setAgentList((prev) => [createdAgent, ...prev]);
      setRuntimeByAgentId((prev) => ({
        ...prev,
        [createdAgent.id]: {
          agentId: createdAgent.id,
          manualStatus: "live",
          status: "PENDING",
          winRate: null,
          netAlpha: null,
          lastPredictionAt: null,
          predictions30d: 0
        }
      }));
      setCreateForm(defaultForm);
      setShowCreateModal(false);
      setBuilderStep(1);
    });
  }

  async function submitEdit(): Promise<void> {
    if (!editingAgentId) {
      return;
    }

    setError(null);
    startTransition(async () => {
      const enhancedPrompt = buildPromptTemplate(editForm.promptTemplate, editSelectedSourceIds, {
        pollIntervalSeconds: editPollIntervalSeconds,
        confidenceThreshold: editConfidenceThreshold,
        maxPositionUsd: editMaxPositionUsd,
        maxOpenTrades: editMaxOpenTrades
      });

      const response = await fetch("/api/agents", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          agentId: editingAgentId,
          ...editForm,
          promptTemplate: enhancedPrompt
        })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        setError(payload.error ?? "Failed to update agent.");
        return;
      }

      const updatedAgent = (await response.json()) as AgentProfile;
      setAgentList((prev) => prev.map((agent) => (agent.id === updatedAgent.id ? updatedAgent : agent)));
      closeEditModal();
    });
  }

  async function removeAgent(agentId: string): Promise<void> {
    setError(null);
    setDeletingAgentId(agentId);

    startTransition(async () => {
      try {
        const response = await fetch("/api/agents", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ agentId })
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { error?: string };
          setError(payload.error ?? "Failed to delete agent.");
          return;
        }

        setAgentList((prev) => prev.filter((agent) => agent.id !== agentId));
        setRuntimeByAgentId((prev) => {
          const next = { ...prev };
          delete next[agentId];
          return next;
        });
        if (editingAgentId === agentId) {
          closeEditModal();
        }
      } finally {
        setDeletingAgentId(null);
      }
    });
  }

  async function toggleAgentStatus(agentId: string, nextStatus: "LIVE" | "PAUSED"): Promise<void> {
    setError(null);

    startTransition(async () => {
      const response = await fetch("/api/agents", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          agentId,
          status: nextStatus
        })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        setError(payload.error ?? "Failed to update agent status.");
        return;
      }

      const payload = (await response.json()) as { runtime?: AgentRuntimeSummary | null };
      const nextRuntime = payload.runtime;
      if (nextRuntime) {
        setRuntimeByAgentId((prev) => ({
          ...prev,
          [nextRuntime.agentId]: nextRuntime
        }));
      }
    });
  }

  return (
    <>
      <div className="panel stack agent-builder-panel">
        <div className="row">
          <h2>Agent Builder</h2>
          <button
            type="button"
            onClick={openBuilderModal}
          >
            + New Agent
          </button>
        </div>
        <div className="small">Configure, deploy, and monitor forecasting agents from one control surface.</div>
        {error ? <div className="small bad">{error}</div> : null}

        <div className="agent-metric-grid">
          <div className="agent-metric-card">
            <div className="agent-metric-value">{summary.activeCount}</div>
            <div className="agent-metric-label">Active Agents</div>
          </div>
          <div className="agent-metric-card">
            <div className="agent-metric-value">{summary.avgBrier.toFixed(2)}</div>
            <div className="agent-metric-label">Avg Brier</div>
          </div>
          <div className="agent-metric-card">
            <div className={`agent-metric-value ${summary.netAlpha >= 0 ? "good" : "bad"}`}>
              {summary.netAlpha >= 0 ? "+" : "-"}${Math.abs(summary.netAlpha).toFixed(0)}
            </div>
            <div className="agent-metric-label">Net Alpha (30d)</div>
          </div>
          <div className="agent-metric-card">
            <div className="agent-metric-value">{summary.avgWinRate.toFixed(0)}%</div>
            <div className="agent-metric-label">Win Rate</div>
          </div>
          <div className="agent-metric-card">
            <div className="agent-metric-value">{summary.predictions}</div>
            <div className="agent-metric-label">Predictions</div>
          </div>
        </div>

        <div className="panel-scroll">
          <table className="agent-table">
            <colgroup>
              <col className="agent-col-name" />
              <col className="agent-col-strategy" />
              <col className="agent-col-status" />
              <col className="agent-col-win" />
              <col className="agent-col-alpha" />
              <col className="agent-col-last" />
              <col className="agent-col-action" />
            </colgroup>
            <thead>
              <tr>
                <th>Agent Name</th>
                <th>Strategy</th>
                <th>Status</th>
                <th>Win Rate</th>
                <th>Net Alpha</th>
                <th>Last Pred.</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {agentRows.map(({ agent, telemetry }) => (
                <tr key={agent.id}>
                  <td>
                    <span className={`agent-dot ${telemetry.statusClass}`} />
                    <strong>{agent.name}</strong>
                  </td>
                  <td className="small">{telemetry.strategy}</td>
                  <td>
                    <span className={`agent-status ${telemetry.statusClass}`}>{telemetry.status}</span>
                  </td>
                  <td>{telemetry.winRate === null ? "—" : `${telemetry.winRate}%`}</td>
                  <td className={telemetry.netAlpha === null ? "" : telemetry.netAlpha >= 0 ? "good" : "bad"}>
                    {currency(telemetry.netAlpha)}
                  </td>
                  <td className="small">{telemetry.lastPredictionLabel}</td>
                  <td>
                    <div className="agent-action-group">
                      <button
                        type="button"
                        className="agent-view-link"
                        disabled={pending}
                        onClick={() => openEditModal(agent)}
                      >
                        View
                      </button>
                      <button
                        type="button"
                        className="agent-toggle-link"
                        disabled={pending}
                        onClick={() =>
                          toggleAgentStatus(agent.id, telemetry.status === "PAUSED" ? "LIVE" : "PAUSED")
                        }
                      >
                        {telemetry.status === "PAUSED" ? "Resume" : "Pause"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showCreateModal ? (
        <div className="modal-backdrop" onClick={() => setShowCreateModal(false)}>
          <div
            className="modal-card stack builder-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Create Agent"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="row">
              <h3>Agent Builder</h3>
              <button type="button" onClick={() => setShowCreateModal(false)}>
                Close
              </button>
            </div>

            <div className="builder-steps">
              {[1, 2, 3, 4].map((step) => (
                <button
                  type="button"
                  key={step}
                  className={`builder-step ${builderStep === step ? "active" : ""}`}
                  onClick={() => setBuilderStep(step as BuilderStep)}
                >
                  {step === 1
                    ? "1 Strategy"
                    : step === 2
                      ? "2 Data Sources"
                      : step === 3
                        ? "3 Execution Rules"
                        : "4 Review & Deploy"}
                </button>
              ))}
            </div>

            {builderStep === 1 ? (
              <div className="builder-panel stack">
                <h4>Define Strategy</h4>
                <label>
                  Agent Name
                  <input
                    value={createForm.name}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, name: event.target.value }))}
                    placeholder="MacroSentinel"
                  />
                </label>

                <label>
                  Primary Domain
                  <input
                    value={createForm.domain}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, domain: event.target.value }))}
                    placeholder="Macro + News"
                  />
                </label>

                <label>
                  Risk Profile
                  <select
                    value={createForm.riskProfile}
                    onChange={(event) =>
                      setCreateForm((prev) => ({
                        ...prev,
                        riskProfile: event.target.value as AgentFormState["riskProfile"]
                      }))
                    }
                  >
                    <option value="conservative">conservative</option>
                    <option value="balanced">balanced</option>
                    <option value="aggressive">aggressive</option>
                  </select>
                </label>

                <label>
                  Prompt Template
                  <textarea
                    value={createForm.promptTemplate}
                    rows={4}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, promptTemplate: event.target.value }))}
                  />
                </label>
              </div>
            ) : null}

            {builderStep === 2 ? (
              <div className="builder-panel builder-grid">
                <div className="builder-column builder-source-list">
                  <div className="builder-column-header">
                    <h4>Available Sources</h4>
                  </div>
                  <div className="stack builder-column-body">
                    {availableSources.map((source) => {
                      const selected = selectedSourceIds.includes(source.id);
                      return (
                        <button
                          type="button"
                          key={source.id}
                          className={`builder-source-item ${selected ? "selected" : ""}`}
                          onClick={() => toggleSource(source.id)}
                        >
                          <span>
                            <strong>{source.label}</strong>
                            <span className="small">{source.detail}</span>
                          </span>
                          <span className="badge">{selected ? "Added" : source.kind}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="builder-column builder-pipeline">
                  <div className="builder-column-header">
                    <h4>Active Pipeline ({selectedSources.length} sources)</h4>
                  </div>
                  <div className="stack builder-column-body">
                    {selectedSources.map((source) => (
                      <div className="builder-stage" key={source.id}>
                        <strong>{source.label}</strong>
                        <div className="small">{source.detail}</div>
                      </div>
                    ))}
                    <div className="builder-engine">
                      <strong>Knowledge Engine</strong>
                      <div className="small">GraphRAG, trust scoring, and signal fusion.</div>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {builderStep === 3 ? (
              <div className="builder-panel stack">
                <h4>Execution Rules</h4>

                <label>
                  Poll Interval (seconds)
                  <input
                    type="range"
                    min={15}
                    max={180}
                    step={15}
                    value={pollIntervalSeconds}
                    onChange={(event) => setPollIntervalSeconds(Number(event.target.value))}
                  />
                  <span className="small">{pollIntervalSeconds}s</span>
                </label>

                <label>
                  Confidence Threshold
                  <input
                    type="range"
                    min={0.55}
                    max={0.95}
                    step={0.01}
                    value={confidenceThreshold}
                    onChange={(event) => setConfidenceThreshold(Number(event.target.value))}
                  />
                  <span className="small">{confidenceThreshold.toFixed(2)}</span>
                </label>

                <label>
                  Max Position Size (USD)
                  <input
                    type="number"
                    min={10}
                    step={5}
                    value={maxPositionUsd}
                    onChange={(event) => setMaxPositionUsd(Number(event.target.value))}
                  />
                </label>

                <label>
                  Max Open Trades
                  <input
                    type="number"
                    min={1}
                    max={12}
                    step={1}
                    value={maxOpenTrades}
                    onChange={(event) => setMaxOpenTrades(Number(event.target.value))}
                  />
                </label>
              </div>
            ) : null}

            {builderStep === 4 ? (
              <div className="builder-panel stack">
                <h4>Review & Deploy</h4>
                <div className="item">
                  <div className="row">
                    <strong>{createForm.name || "Unnamed agent"}</strong>
                    <span className="badge">{createForm.riskProfile}</span>
                  </div>
                  <div className="small">Strategy: {createForm.domain || "n/a"}</div>
                  <div className="small">Sources: {selectedSources.map((source) => source.label).join(", ")}</div>
                  <div className="small">
                    Rules: every {pollIntervalSeconds}s, threshold {confidenceThreshold.toFixed(2)}, max ${maxPositionUsd}
                    / trade, {maxOpenTrades} open positions.
                  </div>
                </div>
                <div className="small">
                  Deploy creates the agent profile now and stores this builder configuration in its prompt template.
                </div>
              </div>
            ) : null}

            <div className="row">
              <button type="button" disabled={pending || builderStep === 1} onClick={previousStep}>
                Back
              </button>
              {builderStep < 4 ? (
                <button
                  type="button"
                  disabled={
                    pending || (builderStep === 1 && !canGoNextFromStep1) || (builderStep === 2 && !canGoNextFromStep2)
                  }
                  onClick={nextStep}
                >
                  Next
                </button>
              ) : (
                <button type="button" disabled={pending || !canGoNextFromStep1} onClick={submitCreate}>
                  {pending ? "Deploying..." : "Deploy Agent"}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {showEditModal ? (
        <div className="modal-backdrop" onClick={closeEditModal}>
          <div
            className="modal-card stack builder-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Edit Agent"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="row">
              <h3>Edit Agent</h3>
              <button type="button" onClick={closeEditModal}>
                Close
              </button>
            </div>
            {error ? <div className="small bad">{error}</div> : null}

            <label>
              Name
              <input
                value={editForm.name}
                onChange={(event) => setEditForm((prev) => ({ ...prev, name: event.target.value }))}
              />
            </label>

            <label>
              Domain
              <input
                value={editForm.domain}
                onChange={(event) => setEditForm((prev) => ({ ...prev, domain: event.target.value }))}
              />
            </label>

            <label>
              Risk Profile
              <select
                value={editForm.riskProfile}
                onChange={(event) =>
                  setEditForm((prev) => ({
                    ...prev,
                    riskProfile: event.target.value as AgentFormState["riskProfile"]
                  }))
                }
              >
                <option value="conservative">conservative</option>
                <option value="balanced">balanced</option>
                <option value="aggressive">aggressive</option>
              </select>
            </label>

            <label>
              Prompt Template
              <textarea
                value={editForm.promptTemplate}
                rows={3}
                onChange={(event) => setEditForm((prev) => ({ ...prev, promptTemplate: event.target.value }))}
              />
            </label>

            <div className="builder-panel builder-grid">
              <div className="builder-column builder-source-list">
                <div className="builder-column-header">
                  <h4>Data Sources</h4>
                </div>
                <div className="stack builder-column-body">
                  {availableSources.map((source) => {
                    const selected = editSelectedSourceIds.includes(source.id);
                    return (
                      <button
                        type="button"
                        key={source.id}
                        className={`builder-source-item ${selected ? "selected" : ""}`}
                        onClick={() => toggleEditSource(source.id)}
                      >
                        <span>
                          <strong>{source.label}</strong>
                          <span className="small">{source.detail}</span>
                        </span>
                        <span className="badge">{selected ? "Added" : source.kind}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="builder-column builder-pipeline">
                <div className="builder-column-header">
                  <h4>Current Pipeline ({editSelectedSources.length} sources)</h4>
                </div>
                <div className="stack builder-column-body">
                  {editSelectedSources.map((source) => (
                    <div className="builder-stage" key={source.id}>
                      <strong>{source.label}</strong>
                      <div className="small">{source.detail}</div>
                    </div>
                  ))}
                  <div className="builder-engine">
                    <strong>Knowledge Engine</strong>
                    <div className="small">GraphRAG, trust scoring, and signal fusion.</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="builder-panel stack">
              <h4>Execution Rules</h4>
              <label>
                Poll Interval (seconds)
                <input
                  type="range"
                  min={15}
                  max={180}
                  step={15}
                  value={editPollIntervalSeconds}
                  onChange={(event) => setEditPollIntervalSeconds(Number(event.target.value))}
                />
                <span className="small">{editPollIntervalSeconds}s</span>
              </label>

              <label>
                Confidence Threshold
                <input
                  type="range"
                  min={0.55}
                  max={0.95}
                  step={0.01}
                  value={editConfidenceThreshold}
                  onChange={(event) => setEditConfidenceThreshold(Number(event.target.value))}
                />
                <span className="small">{editConfidenceThreshold.toFixed(2)}</span>
              </label>

              <label>
                Max Position Size (USD)
                <input
                  type="number"
                  min={10}
                  step={5}
                  value={editMaxPositionUsd}
                  onChange={(event) => setEditMaxPositionUsd(Number(event.target.value))}
                />
              </label>

              <label>
                Max Open Trades
                <input
                  type="number"
                  min={1}
                  max={20}
                  step={1}
                  value={editMaxOpenTrades}
                  onChange={(event) => setEditMaxOpenTrades(Number(event.target.value))}
                />
              </label>
            </div>

            <div className="row">
              <button
                type="button"
                className="button-danger"
                disabled={pending || !editingAgentId}
                onClick={() => {
                  if (!editingAgentId) {
                    return;
                  }
                  const selected = agentList.find((agent) => agent.id === editingAgentId);
                  const displayName = selected?.name ?? "this agent";
                  if (!window.confirm(`Delete agent "${displayName}"?`)) {
                    return;
                  }
                  void removeAgent(editingAgentId);
                }}
              >
                {deletingAgentId && deletingAgentId === editingAgentId ? "Deleting..." : "Delete Agent"}
              </button>

              <button
                type="button"
                disabled={
                  pending ||
                  !editingAgentId ||
                  editForm.name.trim().length < 2 ||
                  editSelectedSourceIds.length === 0
                }
                onClick={submitEdit}
              >
                {pending && !deletingAgentId ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
