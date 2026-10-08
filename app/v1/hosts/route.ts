import { allHosts } from "@/src/census/data";
import { respond } from "@/src/census/respond";

export const dynamic = "force-dynamic";

export function GET() {
  const hosts = allHosts();
  return respond({ count: hosts.length, hosts });
}
