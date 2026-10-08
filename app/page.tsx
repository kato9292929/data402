import Link from "next/link";
import { allHosts, meta, targets, USDC_MINT, type HostSummary } from "@/lib/data";

export const dynamic = "force-dynamic";

const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
const amountText = (x: HostSummary["amount"][number]) => {
  if (x.amount === null) return "-";
  if (x.asset === USDC_MINT && /^\d+$/.test(x.amount)) return `${(Number(x.amount) / 1e6).toString()} USDC`;
  return `${x.amount} ${x.asset ? short(x.asset) : ""}`.trim();
};
const time = (t: string | null) => (t ? t.replace("T", " ").replace(/\.\d+Z$/, "Z") : "-");

const css = `
body{font:14px/1.5 system-ui,sans-serif;margin:0;padding:16px;color:#111;background:#fff}
@media (prefers-color-scheme:dark){body{color:#ddd;background:#111}a{color:#8ab4f8}th{background:#222!important}td,th{border-color:#333!important}}
h1{font-size:20px;margin:0 0 8px}
.about{margin:0 0 16px;max-width:60em}
.nums{display:flex;flex-wrap:wrap;gap:24px;margin:0 0 16px}
.nums div{min-width:9em}.nums b{display:block;font-size:22px}
.wrap{overflow-x:auto}
table{border-collapse:collapse;width:100%}
td,th{border-bottom:1px solid #ddd;padding:4px 8px;text-align:left;white-space:nowrap;vertical-align:top}
th{background:#f4f4f4;position:sticky;top:0}
code{font-size:13px}.filter{margin:0 0 12px}
`;

export default async function Page({ searchParams }: { searchParams: Promise<{ payTo?: string }> }) {
  const { payTo } = await searchParams;
  const hosts = allHosts();
  const m = meta();
  const t = targets();
  const shared = new Map<string, number>();
  for (const h of hosts) for (const p of h.payTo) shared.set(p, (shared.get(p) ?? 0) + 1);
  // the four numbers count hosts in the current target list only (spec/11 section 4)
  const current = t ? hosts.filter((h) => h.in_current_targets) : hosts;
  const alive = current.filter((h) => h.status === "alive");
  const distinctPayTo = new Set(alive.flatMap((h) => h.payTo)).size;
  const rows = payTo ? hosts.filter((h) => h.payTo.includes(payTo)) : hosts;

  return (
    <main>
      <style>{css}</style>
      <h1>data402</h1>
      <p className="about">
        Solana を受け付ける x402 の出品に、支払いをせずに要求を送り、返ってきた 402 の中身（受取先・金額）と応答の有無を記録している。
        <br />
        対象は Solana のみ。観測した事実と観測日時を載せるだけで、出品者についての判定やラベル付けはしない。
        <br />
        運営者は x402 のデータを扱っている（カタログ kato9292929/endpoint）。方法と生データ: <a href="https://github.com/kato9292929/data402">github.com/kato9292929/data402</a>、JSON: <a href="/v1/hosts">/v1/hosts</a>
      </p>
      <div className="nums">
        <div>
          対象ホスト数<b>{t?.hosts ?? hosts.length}</b>
        </div>
        <div>
          生きているホスト数<b>{alive.length}</b>
        </div>
        <div>
          相異なる受取先の数<b>{distinctPayTo}</b>
        </div>
        <div>
          最終更新<b style={{ fontSize: 16 }}>{time(m.last_observed_at)}</b>
        </div>
      </div>
      {payTo && (
        <p className="filter">
          受取先 <code>{payTo}</code> を示したホスト {rows.length} 件 — <Link href="/">すべて表示</Link>
        </p>
      )}
      <div className="wrap">
        <table>
          <thead>
            <tr>
              <th>host</th>
              <th>status</th>
              <th>payTo</th>
              <th>amount</th>
              <th>last_seen</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((h) => (
              <tr key={h.host}>
                <td>
                  <a href={`/v1/hosts/${encodeURIComponent(h.host)}`}>{h.host}</a>
                  {!h.in_current_targets && " (カタログの対象外)"}
                </td>
                <td>{h.status}</td>
                <td>
                  {h.payTo.length === 0
                    ? "-"
                    : h.payTo.map((p) => (
                        <div key={p}>
                          <a href={`https://solscan.io/account/${p}`} title={p}>
                            <code>{short(p)}</code>
                          </a>
                          {(shared.get(p) ?? 0) > 1 && (
                            <>
                              {" "}
                              <Link href={`/?payTo=${encodeURIComponent(p)}`}>同じ受取先 {shared.get(p)} 件</Link>
                            </>
                          )}
                        </div>
                      ))}
                </td>
                <td>{h.amount.length ? h.amount.map((x) => <div key={`${x.amount}|${x.asset}|${x.scheme}`}>{amountText(x)}</div>) : "-"}</td>
                <td>{time(h.last_seen)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
