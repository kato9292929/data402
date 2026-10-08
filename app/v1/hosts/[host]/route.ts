import { hostDetail } from "@/src/census/data";
import { respond } from "@/src/census/respond";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ host: string }> }) {
  const { host } = await ctx.params;
  const d = hostDetail(decodeURIComponent(host));
  if (!d) return respond({ error: "not_observed", host }, 404);
  return respond({ host: d.summary.host, latest: d.summary, latest_per_endpoint: d.latest, history: d.history, history_returned: d.history.length, history_total: d.history_total });
}
