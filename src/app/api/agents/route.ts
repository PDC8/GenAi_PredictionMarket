import { NextResponse } from "next/server";
import { z } from "zod";

import { createAgent, deleteAgentById, listAgents, updateAgentById } from "@/lib/db/repository";

export const dynamic = "force-dynamic";

const CreateAgentSchema = z.object({
  name: z.string().min(2),
  domain: z.string().min(2),
  riskProfile: z.enum(["conservative", "balanced", "aggressive"]),
  promptTemplate: z.string().min(8)
});

const UpdateAgentSchema = CreateAgentSchema.extend({
  agentId: z.string().min(1)
});

const DeleteAgentSchema = z.object({
  agentId: z.string().min(1)
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

export async function PUT(request: Request) {
  const payload = UpdateAgentSchema.safeParse(await request.json());
  if (!payload.success) {
    return NextResponse.json({ error: payload.error.issues }, { status: 400 });
  }

  const agent = await updateAgentById(payload.data);
  if (!agent) {
    return NextResponse.json({ error: "Agent not found." }, { status: 404 });
  }

  return NextResponse.json(agent);
}

export async function DELETE(request: Request) {
  const body = await request.json().catch(() => null);
  const payload = DeleteAgentSchema.safeParse(body);
  if (!payload.success) {
    return NextResponse.json({ error: payload.error.issues }, { status: 400 });
  }

  const result = await deleteAgentById(payload.data.agentId);
  if (result.status === "not_found") {
    return NextResponse.json({ error: "Agent not found." }, { status: 404 });
  }

  if (result.status === "in_use") {
    return NextResponse.json(
      { error: "This agent has prediction history and cannot be deleted." },
      { status: 409 }
    );
  }

  return NextResponse.json({ deleted: true });
}
