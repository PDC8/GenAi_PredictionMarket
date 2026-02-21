import { NextResponse } from "next/server";
import { z } from "zod";

import { syncMarketsFromKalshi } from "@/lib/markets/service";

export const dynamic = "force-dynamic";

const SyncSchema = z.object({
  limit: z.number().int().min(1).max(200).optional()
});

export async function POST(request: Request) {
  const raw = await request.text();
  const parsedJson = raw ? (JSON.parse(raw) as unknown) : {};
  const payload = SyncSchema.safeParse(parsedJson);

  if (!payload.success) {
    return NextResponse.json({ error: payload.error.issues }, { status: 400 });
  }

  const result = await syncMarketsFromKalshi(payload.data.limit ?? 50);
  return NextResponse.json(result);
}
