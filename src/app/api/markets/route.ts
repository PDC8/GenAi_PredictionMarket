import { NextResponse } from "next/server";
import { z } from "zod";

import { listMarketCards } from "@/lib/db/repository";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  status: z.enum(["open", "closed", "resolved"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional()
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const payload = querySchema.safeParse({
    status: url.searchParams.get("status") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined
  });

  if (!payload.success) {
    return NextResponse.json({ error: payload.error.issues }, { status: 400 });
  }

  const markets = await listMarketCards(payload.data);
  return NextResponse.json(markets);
}
