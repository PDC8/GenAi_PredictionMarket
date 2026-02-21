import { NextResponse } from "next/server";
import { z } from "zod";

import { recordResolutionAndSettle } from "@/lib/execution/service";
import { refreshUnitEconomicsMetric } from "@/lib/metrics/service";

export const dynamic = "force-dynamic";

const ResolutionSchema = z.object({
  marketId: z.string().min(3),
  outcome: z.enum(["YES", "NO"])
});

export async function POST(request: Request) {
  const payload = ResolutionSchema.safeParse(await request.json());
  if (!payload.success) {
    return NextResponse.json({ error: payload.error.issues }, { status: 400 });
  }

  try {
    const result = await recordResolutionAndSettle(payload.data);
    await refreshUnitEconomicsMetric();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
