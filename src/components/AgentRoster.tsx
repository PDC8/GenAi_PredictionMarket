"use client";

import { useEffect, useState, useTransition } from "react";

import type { AgentProfile } from "@/types/domain";

interface AgentRosterProps {
  agents: AgentProfile[];
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

export function AgentRoster({ agents }: AgentRosterProps) {
  const [pending, startTransition] = useTransition();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [agentList, setAgentList] = useState<AgentProfile[]>(agents);
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [deletingAgentId, setDeletingAgentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState<AgentFormState>(defaultForm);
  const [editForm, setEditForm] = useState<AgentFormState>(defaultForm);

  useEffect(() => {
    setAgentList(agents);
  }, [agents]);

  function openEditModal(agent: AgentProfile): void {
    setError(null);
    setEditingAgentId(agent.id);
    setEditForm({
      name: agent.name,
      domain: agent.domain,
      riskProfile: agent.riskProfile,
      promptTemplate: agent.promptTemplate
    });
    setShowCreateModal(false);
    setShowEditModal(true);
  }

  function closeEditModal(): void {
    setShowEditModal(false);
    setEditingAgentId(null);
    setDeletingAgentId(null);
  }

  async function submitCreate(): Promise<void> {
    setError(null);
    startTransition(async () => {
      const response = await fetch("/api/agents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(createForm)
      });

      if (!response.ok) {
        setError("Failed to create agent.");
        return;
      }

      const createdAgent = (await response.json()) as AgentProfile;
      setAgentList((prev) => [createdAgent, ...prev]);
      setCreateForm(defaultForm);
      setShowCreateModal(false);
    });
  }

  async function submitEdit(): Promise<void> {
    if (!editingAgentId) {
      return;
    }

    setError(null);
    startTransition(async () => {
      const response = await fetch("/api/agents", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          agentId: editingAgentId,
          ...editForm
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
        if (editingAgentId === agentId) {
          closeEditModal();
        }
      } finally {
        setDeletingAgentId(null);
      }
    });
  }

  return (
    <>
      <div className="panel stack dashboard-panel">
        <div className="row">
          <h2>Agent Roster</h2>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setShowEditModal(false);
              setShowCreateModal(true);
            }}
          >
            Create Agent
          </button>
        </div>
        <div className="small">Create and manage strategy agents. Click an agent to edit.</div>
        {error ? <div className="small bad">{error}</div> : null}

        <div className="stack panel-scroll">
          {agentList.map((agent) => (
            <button
              type="button"
              className="item item-clickable"
              key={agent.id}
              disabled={pending}
              onClick={() => openEditModal(agent)}
            >
              <div className="row">
                <strong>{agent.name}</strong>
                <span className="badge">{agent.riskProfile}</span>
              </div>
              <div className="small">{agent.domain}</div>
            </button>
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
                value={createForm.name}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="New agent"
              />
            </label>

            <label>
              Domain
              <input
                value={createForm.domain}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, domain: event.target.value }))}
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
                rows={3}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, promptTemplate: event.target.value }))}
              />
            </label>

            <button type="button" disabled={pending || createForm.name.trim().length < 2} onClick={submitCreate}>
              {pending ? "Creating..." : "Create Agent"}
            </button>
          </div>
        </div>
      ) : null}

      {showEditModal ? (
        <div className="modal-backdrop" onClick={closeEditModal}>
          <div
            className="modal-card stack"
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
                disabled={pending || !editingAgentId || editForm.name.trim().length < 2}
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
