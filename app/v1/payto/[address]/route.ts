import { payToHosts } from "@/src/census/data";
import { respond } from "@/src/census/respond";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ address: string }> }) {
  const { address } = await ctx.params;
  const hosts = payToHosts(decodeURIComponent(address));
  if (!hosts) return respond({ error: "not_observed", payTo: address }, 404);
  return respond({ payTo: address, count: hosts.length, hosts });
}
