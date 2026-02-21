import { NextResponse } from "next/server";
import { z } from "zod";

import { recordPredictionMetrics } from "@/lib/metrics/service";
import { runPrediction } from "@/lib/orchestrator/pipeline";

export const dynamic = "force-dynamic";

const RunPredictionSchema = z.object({
  marketId: z.string().min(3),
  agentId: z.string().min(3),
  useLlm: z.boolean().optional()
});

export async function POST(request: Request) {
  const payload = RunPredictionSchema.safeParse(await request.json());
  if (!payload.success) {
    return NextResponse.json({ error: payload.error.issues }, { status: 400 });
  }

  try {
    const run = await runPrediction(payload.data);
    await recordPredictionMetrics();
    return NextResponse.json(run);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
