import { NextResponse, type NextRequest } from "next/server";
import { closeTask, TaskError } from "@/src/budget/tasks";
import { errorResponse, ownerAuthorized, unauthorized } from "@/src/budget/http";
import { SolanaSetupError } from "@/src/budget/solana/allowance";
import { explainSolanaError } from "@/src/budget/solana/errors";

// Owner only. Revokes the task's Allowance on chain. Irreversible.
export async function POST(req: NextRequest, ctx: RouteContext<"/api/tasks/[id]/close">) {
  if (!ownerAuthorized(req)) return unauthorized();
  const { id } = await ctx.params;
  try {
    return NextResponse.json(await closeTask(id));
  } catch (e) {
    if (e instanceof TaskError) return errorResponse(e, e.status);
    if (e instanceof SolanaSetupError) return errorResponse(e, 409);
    // Chain failure: return causes and simulation logs to the owner (no secrets are in them).
    console.error(e);
    return NextResponse.json({ error: (e as Error).message, details: explainSolanaError(e) }, { status: 502 });
  }
}
