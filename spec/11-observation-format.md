# 11. Observation format and probe rules

Fixed 2026-10-08, with the first scheduled-probe implementation (`data402-probe@1.0.0`).
Changes to this file are new commits; earlier text is not rewritten.

## 1. Rows

`data/observations.jsonl`: one observation per line, appended. Rows already written are never
changed or removed. A failed request is a row too: without it the denominator of "how often a
host answered" would be wrong.

| field | value |
|---|---|
| `observed_at` | ISO 8601, UTC, when the request was started |
| `endpoint_id` | the catalog's id (`kato9292929/endpoint`) |
| `host` | hostname, lower case, without a leading `www.` (the catalog's `hostOf`) |
| `url` | the URL requested |
| `status` | `alive` / `no_402` / `unreachable` / `no_solana` (section 2) |
| `http_status` | the HTTP status of the recorded response; `null` when there was none |
| `payTo` | `payTo` of the first Solana mainnet entry of `accepts`, if it is a base58 string of 32–44 characters; else `null` |
| `amount` | that entry's `amount` (v2) or `maxAmountRequired` (v1), as a string, in the asset's smallest unit, as the 402 gave it |
| `asset` | that entry's `asset` (the token mint) |
| `network` | `solana` when `status` is `alive`, else `null` |
| `scheme` | that entry's `scheme`, as the 402 named it (`exact`, `batch`, …) |
| `extra` | that entry's `extra`, stored whole (`feePayer` included); `null` if absent |
| `response_ms` | time from sending the recorded request to the end of its body |
| `probe_version` | the probe that wrote the row |

Fields added beyond the brief, all copied from the request or the response:

| field | why |
|---|---|
| `method` | `GET` or `POST`: which request the row records (section 3) |
| `error` | on `unreachable`: the error the request ended with (`timeout`, `ENOTFOUND`, …); on `no_solana`: `402_not_parsed` when the 402 carried no readable `accepts` |
| `x402_version` | `x402Version` from the 402, when `alive` |
| `accepts` | every Solana mainnet entry of `accepts` (scheme, network, amount, asset, payTo, maxTimeoutSeconds, extra), when `alive`. The flat fields above come from the first one; a 402 can offer more than one (e.g. `exact` and `batch`), and these are not dropped |

Solana mainnet is the network `solana` (v1) or `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` (v2),
case-insensitive. Devnet and testnet entries are not Solana mainnet.

## 2. `status`

The brief says the statuses are "5つ" and lists four. The four listed are used, and no other is added.

| status | condition |
|---|---|
| `alive` | HTTP 402, and `accepts` has at least one Solana mainnet entry |
| `no_solana` | HTTP 402, and no Solana mainnet entry could be read (only other networks, or no readable `accepts`) |
| `no_402` | an HTTP response other than 402 (redirects are not followed, so 3xx is recorded as such) |
| `unreachable` | no HTTP response: timeout, DNS, TLS, connection refused or reset, or a proxy on our side refusing the connection (the `error` text keeps what was said) |

`alive` says only that the endpoint answered with a Solana payment requirement at that time.

## 3. Request

- GET, no payment header, `redirect: manual`, timeout `request_timeout_ms`.
- If GET answered with something other than 402, the same URL is asked once by POST with body
  `{}` and `content-type: application/json` (some sellers answer 402 only to POST). If POST
  answered 402, the row records POST; otherwise it records GET.
- After a network error, one retry after `error_retry_wait_ms`. After a 429 or 503, one retry
  after `Retry-After` (at most `max_retry_after_s`, 30 s if absent).
- A host that answered 429 twice in a run gets no more requests in that run.
- `user-agent` names data402 and says the probe never pays.
- A v2 402 is read from the `PAYMENT-REQUIRED` header (base64 JSON); otherwise from the body.

## 4. Targets, schedule, and how rows are grouped

**Targets.** The rule of spec/10 revision 2 (`2ae1a94`), unchanged: catalog records priced in
USDC per call above zero, `last_seen` within 14 days of the catalog's `generated_at`, `networks`
including `Solana`. Per host, at most `max_endpoints_per_host` endpoints: endpoints already in
`observations.jsonl` stay (earliest first observation first), free places are filled in
sha256(`selection_seed:endpoint_id`) order. The 2026-10-08 run picked up to four per host at
random; keeping observed endpoints first means the set follows the catalog without being drawn
again each day. Each run writes the list to `data/targets.json`, with the catalog's
`generated_at`.

**Schedule.** One run every `run_interval_hours` (24). An endpoint is due when its latest row is
`min_reobserve_hours` (20) old or more, or it has none. Due endpoints go oldest first. A run stops
starting requests after `max_run_minutes`; what is left stays due and comes first in the next run.
Requests to one host are sequential and `same_host_gap_ms` apart; at most `concurrency` hosts at
once. Two runs cannot overlap (`data/.probe.lock`).

**Grouping (API and page).** These are counting rules, not judgements.

- A host's latest state uses the latest row of each of its endpoints.
- Host `status`: `alive` if the latest row of any endpoint is `alive`; otherwise the status of the
  newest of those latest rows.
- Host `payTo` and `amount`: the distinct values in the latest `alive` rows of its endpoints.
- `last_seen` / `first_seen`: the newest / oldest `alive` row of the host, at any time.
- `in_current_targets`: the host is in the latest `data/targets.json`. Hosts that have left the
  catalog keep their rows and stay listed.
- The page's four numbers count hosts in the current targets only.

## 5. The rows before data402-probe

The first 483 rows are the 2026-10-08 run of Interlock's `research/probe-catalog.mjs` (spec/10,
kept as `data/payto-observations.jsonl`), converted by `scripts/import-legacy.mjs`. Their
`probe_version` is `legacy:x402-Interlock@8debcd5/research/probe-catalog.mjs`. That probe kept
neither `extra` nor response times, so both are `null` in those rows; `maxTimeoutSeconds` is
`null` too. Its failure classes map as: no response → `unreachable`; other HTTP status →
`no_402`; 402 without a Solana entry → `no_solana`; 402 with one → `alive`.
