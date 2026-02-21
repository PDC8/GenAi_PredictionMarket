"use client";

import { useEffect, useState, useTransition } from "react";

import type { AgentProfile } from "@/types/domain";

interface AgentRosterProps {
  agents: AgentProfile[];
}

export function AgentRoster({ agents }: AgentRosterProps) {
  const [pending, startTransition] = useTransition();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [agentList, setAgentList] = useState<AgentProfile[]>(agents);
  const [form, setForm] = useState({
    name: "",
    domain: "Macro",
    riskProfile: "balanced",
    promptTemplate: "Use trust-weighted evidence and preserve reasoning transparency."
  });

  useEffect(() => {
    setAgentList(agents);
  }, [agents]);

  async function submit(): Promise<void> {
    startTransition(async () => {
      const response = await fetch("/api/agents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form)
      });

      if (!response.ok) {
        return;
      }

      const createdAgent = (await response.json()) as AgentProfile;
      setAgentList((prev) => [createdAgent, ...prev]);
      setForm((prev) => ({ ...prev, name: "" }));
      setShowCreateModal(false);
    });
  }

  return (
    <>
      <div className="panel stack dashboard-panel">
        <div className="row">
          <h2>Agent Roster</h2>
          <button type="button" onClick={() => setShowCreateModal(true)}>
            Create Agent
          </button>
        </div>
        <div className="small">Create and manage strategy agents.</div>

        <div className="stack panel-scroll">
          {agentList.map((agent) => (
            <div className="item" key={agent.id}>
              <div className="row">
                <strong>{agent.name}</strong>
                <span className="badge">{agent.riskProfile}</span>
              </div>
              <div className="small">{agent.domain}</div>
            </div>
          ))}
        </div>
      </div>

      {showCreateModal ? (
        <div className="modal-backdrop" onClick={() => setShowCreateModal(false)}>
          <div
            className="modal-card stack"
            role="dialog"
            aria-modal="true"
            aria-label="Create Agent"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="row">
              <h3>Create Agent</h3>
              <button type="button" onClick={() => setShowCreateModal(false)}>
                Close
              </button>
            </div>

            <label>
              Name
              <input
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="New agent"
              />
            </label>

            <label>
              Domain
              <input
                value={form.domain}
                onChange={(event) => setForm((prev) => ({ ...prev, domain: event.target.value }))}
              />
            </label>

            <label>
              Risk Profile
              <select
                value={form.riskProfile}
                onChange={(event) => setForm((prev) => ({ ...prev, riskProfile: event.target.value }))}
              >
                <option value="conservative">conservative</option>
                <option value="balanced">balanced</option>
                <option value="aggressive">aggressive</option>
              </select>
            </label>

            <label>
              Prompt Template
              <textarea
                value={form.promptTemplate}
                rows={3}
                onChange={(event) => setForm((prev) => ({ ...prev, promptTemplate: event.target.value }))}
              />
            </label>

            <button type="button" disabled={pending || form.name.trim().length < 2} onClick={submit}>
              {pending ? "Creating..." : "Create Agent"}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
