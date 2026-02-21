import { NextResponse } from "next/server";
import { z } from "zod";

import { generateFeedbackCorrection } from "@/lib/evaluator/feedback";

export const dynamic = "force-dynamic";

const FeedbackSchema = z.object({
  marketId: z.string().min(3)
});

export async function POST(request: Request) {
  const payload = FeedbackSchema.safeParse(await request.json());
  if (!payload.success) {
    return NextResponse.json({ error: payload.error.issues }, { status: 400 });
  }

  try {
    const correction = await generateFeedbackCorrection(payload.data.marketId);
    return NextResponse.json(correction);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
