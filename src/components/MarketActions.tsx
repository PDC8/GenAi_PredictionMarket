"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { AgentProfile, YesNo } from "@/types/domain";

interface MarketActionsProps {
  marketId: string;
  agents: AgentProfile[];
  latestRunId: string | null;
  defaultSizeUsd: number;
}

export function MarketActions({ marketId, agents, latestRunId, defaultSizeUsd }: MarketActionsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [agentId, setAgentId] = useState(agents[0]?.id ?? "");
  const [useLlm, setUseLlm] = useState(false);
  const [side, setSide] = useState<YesNo>("YES");
  const [sizeUsd, setSizeUsd] = useState(String(defaultSizeUsd || 50));
  const [resolution, setResolution] = useState<YesNo>("YES");
  const [status, setStatus] = useState<string>("");

  function runPrediction(): void {
    startTransition(async () => {
      setStatus("Running prediction...");
      const response = await fetch("/api/predictions/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ marketId, agentId, useLlm })
      });
      setStatus(response.ok ? "Prediction completed." : "Prediction failed.");
      router.refresh();
    });
  }

  function simulateExecution(): void {
    startTransition(async () => {
      if (!latestRunId) {
        setStatus("Run a prediction first.");
        return;
      }
      setStatus("Creating simulated execution...");
      const response = await fetch("/api/executions/simulate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          predictionRunId: latestRunId,
          side,
          sizeUsd: Number(sizeUsd)
        })
      });
      setStatus(response.ok ? "Execution submitted." : "Execution failed.");
      router.refresh();
    });
  }

  function resolveMarket(): void {
    startTransition(async () => {
      setStatus("Resolving market...");
      const response = await fetch("/api/resolutions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ marketId, outcome: resolution })
      });
      setStatus(response.ok ? "Market resolved and positions settled." : "Resolution failed.");
      router.refresh();
    });
  }

  function generateFeedback(): void {
    startTransition(async () => {
      setStatus("Generating correction report...");
      const response = await fetch("/api/feedback/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ marketId })
      });
      setStatus(response.ok ? "Feedback correction generated." : "Feedback generation failed.");
      router.refresh();
    });
  }

  return (
    <div className="panel stack">
      <h3>Actions</h3>

      <label>
        Agent
        <select value={agentId} onChange={(event) => setAgentId(event.target.value)}>
          {agents.map((agent) => (
            <option value={agent.id} key={agent.id}>
              {agent.name}
            </option>
          ))}
        </select>
      </label>

      <label>
        <span className="row">
          <span>Use LLM blend</span>
          <input
            checked={useLlm}
            onChange={(event) => setUseLlm(event.target.checked)}
            type="checkbox"
          />
        </span>
      </label>

      <button type="button" disabled={pending || !agentId} onClick={runPrediction}>
        Run Prediction
      </button>

      <hr />

      <div className="small">Simulated execution</div>
      <label>
        Side
        <select value={side} onChange={(event) => setSide(event.target.value as YesNo)}>
          <option value="YES">YES</option>
          <option value="NO">NO</option>
        </select>
      </label>
      <label>
        Size USD
        <input value={sizeUsd} onChange={(event) => setSizeUsd(event.target.value)} type="number" min={1} />
      </label>
      <button type="button" disabled={pending || !latestRunId} onClick={simulateExecution}>
        Simulate Trade
      </button>

      <hr />

      <div className="small">Resolution + feedback loop</div>
      <label>
        Outcome
        <select value={resolution} onChange={(event) => setResolution(event.target.value as YesNo)}>
          <option value="YES">YES</option>
          <option value="NO">NO</option>
        </select>
      </label>
      <button type="button" disabled={pending} onClick={resolveMarket}>
        Resolve Market
      </button>
      <button type="button" disabled={pending} onClick={generateFeedback}>
        Generate Correction
      </button>

      {status ? <div className="small">{status}</div> : null}
    </div>
  );
}
