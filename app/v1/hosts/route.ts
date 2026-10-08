import { allHosts } from "@/lib/data";
import { respond } from "@/lib/respond";

export const dynamic = "force-dynamic";

export function GET() {
  const hosts = allHosts();
  return respond({ count: hosts.length, hosts });
}
