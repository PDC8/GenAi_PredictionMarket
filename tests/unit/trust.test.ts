import { applyTrustDelta } from "@/lib/evaluator/feedback";

describe("feedback trust updates", () => {
  it("caps helpful trust at upper bound", () => {
    const result = applyTrustDelta(1.49, true);
    expect(result.after).toBe(1.5);
    expect(result.delta).toBe(0.03);
  });

  it("floors harmful trust at lower bound", () => {
    const result = applyTrustDelta(0.21, false);
    expect(result.after).toBe(0.2);
    expect(result.delta).toBe(-0.05);
  });
});
