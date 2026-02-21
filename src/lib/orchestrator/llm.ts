interface LlmForecastInput {
  market: {
    title: string;
    category: string;
    yesPrice: number;
  };
  signals: Array<{
    sourceName: string;
    polarity: string;
    strength: number;
    trustWeight: number;
    excerpt: string;
  }>;
  useLlm: boolean;
}

function parseProbability(raw: string): number | null {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as { probability_yes?: number };
      if (typeof parsed.probability_yes === "number") {
        return parsed.probability_yes;
      }
    } catch {
      // ignore and continue to fallback parser
    }
  }

  const numberMatch = raw.match(/(0\.\d+|1(\.0+)?)/);
  if (!numberMatch) {
    return null;
  }

  const value = Number(numberMatch[1]);
  if (!Number.isFinite(value)) {
    return null;
  }

  return Math.min(0.99, Math.max(0.01, value));
}

export async function estimateProbabilityWithLlm(input: LlmForecastInput): Promise<number | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!input.useLlm || !key) {
    return null;
  }

  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const topSignals = input.signals.slice(0, 8).map((signal) => ({
    source: signal.sourceName,
    polarity: signal.polarity,
    strength: signal.strength,
    trust: signal.trustWeight,
    excerpt: signal.excerpt
  }));

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "You are a prediction calibration module. Return strict JSON: {\"probability_yes\": number} with value in [0.01,0.99]."
        },
        {
          role: "user",
          content: JSON.stringify({
            market: input.market,
            signals: topSignals,
            instruction:
              "Estimate probability market resolves YES, accounting for trust-weighted evidence. Return only JSON."
          })
        }
      ]
    })
  });

  if (!response.ok) {
    return null;
  }

  const body = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = body.choices?.[0]?.message?.content;
  if (!text) {
    return null;
  }

  return parseProbability(text);
}
