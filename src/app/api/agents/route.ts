import { NextResponse } from "next/server";
import { z } from "zod";

import { createAgent, listAgents } from "@/lib/db/repository";

export const dynamic = "force-dynamic";

const CreateAgentSchema = z.object({
  name: z.string().min(2),
  domain: z.string().min(2),
  riskProfile: z.enum(["conservative", "balanced", "aggressive"]),
  promptTemplate: z.string().min(8)
});

export async function GET() {
  const agents = await listAgents();
  return NextResponse.json(agents);
}

export async function POST(request: Request) {
  const payload = CreateAgentSchema.safeParse(await request.json());
  if (!payload.success) {
    return NextResponse.json({ error: payload.error.issues }, { status: 400 });
  }

  const agent = await createAgent(payload.data);
  return NextResponse.json(agent, { status: 201 });
}
