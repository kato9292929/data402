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
| `status` | `alive` / `no_challenge` / `no_solana` / `unavailable` / `no_402` / `unreachable` (section 2; `no_challenge` and `unavailable` from 1.1.0) |
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
| `error` | on `unreachable`: the error the request ended with (`timeout`, `ENOTFOUND`, …). Before 1.1.0 also on `no_solana`: `402_not_parsed` when the 402 carried no readable `accepts` (that case is `no_challenge` from 1.1.0; no row in the data has it) |
| `x402_version` | `x402Version` from the 402, when `alive` |
| `accepts` | every Solana mainnet entry of `accepts` (scheme, network, amount, asset, payTo, maxTimeoutSeconds, extra), when `alive`. The flat fields above come from the first one; a 402 can offer more than one (e.g. `exact` and `batch`), and these are not dropped |

Solana mainnet is the network `solana` (v1) or `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` (v2),
case-insensitive. Devnet and testnet entries are not Solana mainnet.

## 2. `status`

The brief says the statuses are "5つ" and lists four. Those four were used alone up to
`data402-probe@1.0.1`. Two were added in 1.1.0 (2026-10-09), for the reasons below.

| status | condition | since |
|---|---|---|
| `alive` | HTTP 402, and `accepts` has at least one Solana mainnet entry | 1.0.0 |
| `no_challenge` | HTTP 402, and neither the `PAYMENT-REQUIRED` header nor the body carries a readable, non-empty `accepts` (empty body, `{}`, HTML, an undecodable header, `accepts: []`) | 1.1.0 |
| `no_solana` | HTTP 402 with a readable, non-empty `accepts`, none of it on Solana mainnet (other networks only) | 1.0.0 (narrowed in 1.1.0) |
| `unavailable` | HTTP 429 or 5xx, as the response stands after the retry of section 3 | 1.1.0 |
| `no_402` | any other HTTP response (redirects are not followed, so 3xx is recorded as such) | 1.0.0 (narrowed in 1.1.0) |
| `unreachable` | no HTTP response: timeout, DNS, TLS, connection refused or reset, or a proxy on our side refusing the connection (the `error` text keeps what was said) | 1.0.0 |

`alive` says only that the endpoint answered with a Solana payment requirement at that time.

**Why `no_challenge`.** On 2026-10-08 five endpoints of onchain-stock-data answered 402 with an
empty body all day. The seller's facilitator had run out of credit during settlement, and
`@x402/core` builds its settlement-failure answer as a 402 with an empty body. The buyer had not
paid and was not the cause (onchain-stock-data PR #63). Under the four statuses such a row is
`no_solana`, which reads as "sold on other networks": the opposite of what happened. A 402 that
says nothing about how to pay is now recorded as such.

**Why `unavailable`.** The fix in PR #63 answers 503 with `Retry-After` instead. Under the four
statuses that is `no_402`, the same as a 404. That form is spreading, so "not selling right now"
(`unavailable`) is kept apart from "not an x402 listing" (`no_402`).

**Rows written before 1.1.0 keep their status** (section 1: rows are never changed). In them a
429/5xx is `no_402` with that `http_status`, and a 402 without readable `accepts` would be
`no_solana` with `error: 402_not_parsed`. In the data as of 2026-10-09 (984 rows): 33 such
`no_402` rows (502, 503, 530; 14 from the legacy run, 19 from 1.0.0) and no `402_not_parsed`
row. A reader who wants the 1.1.0 classes for old rows can derive them from `http_status` and
`error`; the stored status is what the probe of that time wrote.

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

## 6. Changes

- `data402-probe@1.0.1` (2026-10-08): on `unreachable`, `error` keeps both the error code and its
  message. 1.0.0 kept only the code, so a connection cancelled by a proxy was written as `"0"`
  (4 rows of the first 1.0.0 run, all `api.bilbop.org`). Nothing else changed.
- File locations (2026-10-08, data rebuild brief): the probe moved from `scripts/` to `src/census/`
  (`src/census/probe.mjs`, `probe-lib.mjs`, `schedule.mjs`, `import-legacy.mjs`). References to
  `scripts/…` above mean those files. The probe's behaviour and version are unchanged.
- `data402-probe@1.1.0` (2026-10-09): two statuses added, `no_challenge` and `unavailable`
  (section 2, with the 2026-10-08 event that made the four statuses misleading). `no_solana` now
  needs a readable, non-empty `accepts`; `no_402` no longer covers 429 and 5xx. Rows already
  written keep their status. Changed: `src/census/probe-lib.mjs` (`toRow`), `src/census/data.ts`
  (`Status`), `test/probe-lib.test.mjs`. The request, the retry and the selection are unchanged.
