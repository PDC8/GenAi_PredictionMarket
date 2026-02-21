import { NextResponse } from "next/server";
import { z } from "zod";

import { createSimulatedExecution } from "@/lib/execution/service";

export const dynamic = "force-dynamic";

const SimulateSchema = z.object({
  predictionRunId: z.string().min(3),
  side: z.enum(["YES", "NO"]),
  sizeUsd: z.number().positive().max(1_000_000)
});

export async function POST(request: Request) {
  const payload = SimulateSchema.safeParse(await request.json());
  if (!payload.success) {
    return NextResponse.json({ error: payload.error.issues }, { status: 400 });
  }

  try {
    const execution = await createSimulatedExecution(payload.data);
    return NextResponse.json(execution, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
