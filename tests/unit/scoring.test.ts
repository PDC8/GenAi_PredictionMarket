import {
  blendProbability,
  chooseRecommendation,
  computeConfidence,
  computeDeterministicProbability
} from "@/lib/orchestrator/pipeline";

describe("orchestrator scoring", () => {
  const signals = [
    { sourceName: "A", polarity: "YES" as const, strength: 0.7, trustWeight: 1 },
    { sourceName: "B", polarity: "NO" as const, strength: 0.2, trustWeight: 1.1 },
    { sourceName: "C", polarity: "YES" as const, strength: 0.5, trustWeight: 0.9 }
  ];

  it("is deterministic for fixed input", () => {
    const value1 = computeDeterministicProbability(58, signals);
    const value2 = computeDeterministicProbability(58, signals);
    expect(value1).toBe(value2);
  });

  it("computes confidence within policy bounds", () => {
    const confidence = computeConfidence(signals, Date.now(), 58);
    expect(confidence).toBeGreaterThanOrEqual(0.2);
    expect(confidence).toBeLessThanOrEqual(0.95);
  });

  it("blends deterministic and llm probabilities", () => {
    expect(blendProbability(0.6, null)).toBe(0.6);
    expect(blendProbability(0.6, 0.8)).toBe(0.65);
  });

  it("enforces recommendation thresholds", () => {
    const noTrade = chooseRecommendation(0.55, 0.58, 0.03, 10000);
    expect(noTrade.side).toBeNull();
    expect(noTrade.sizeUsd).toBe(0);

    const trade = chooseRecommendation(0.7, 0.8, 0.12, 10000);
    expect(trade.side).toBe("YES");
    expect(trade.sizeUsd).toBeGreaterThan(0);
    expect(trade.sizeUsd).toBeLessThanOrEqual(500);
  });
});
