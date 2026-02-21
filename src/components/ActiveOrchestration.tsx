import { safeJsonParse } from "@/lib/db/utils";

interface ActiveOrchestrationProps {
  latestRun: {
    stepLogsJson: string;
    createdAt: number;
    rationale: string;
  } | null;
}

export function ActiveOrchestration({ latestRun }: ActiveOrchestrationProps) {
  const steps = safeJsonParse<Array<{ step: string; detail: string; status: string }>>(
    latestRun?.stepLogsJson ?? "[]",
    []
  );

  return (
    <div className="panel stack dashboard-panel">
      <h2>Active Orchestration</h2>
      {!latestRun ? (
        <div className="small">No prediction runs yet. Open a market and run one.</div>
      ) : (
        <>
          <div className="small">Last run: {new Date(latestRun.createdAt).toLocaleString()}</div>
          <div className="panel-scroll">
            <table>
              <thead>
                <tr>
                  <th>Tool / Stage</th>
                  <th>Status</th>
                  <th>Last action / output</th>
                </tr>
              </thead>
              <tbody>
                {steps.map((step, index) => (
                  <tr key={`${step.step}-${index}`}>
                    <td>{step.step}</td>
                    <td>{step.status}</td>
                    <td>{step.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="small">{latestRun.rationale}</div>
        </>
      )}
    </div>
  );
}
