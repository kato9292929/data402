# 00. Provenance of the moved files

The observation part of `kato9292929/x402-Interlock` was moved to this repository on 2026-10-08.
Interlock is the buyer-side payment gate and stays a separate product.

## How it was moved

History was kept. The Interlock branch `claude/tender-noether-7you3c` (head
`8debcd530b167684c2ae53fbdc500a1064e8df09`, PR
[kato9292929/x402-Interlock#8](https://github.com/kato9292929/x402-Interlock/pull/8)) was filtered
with `git filter-repo --preserve-commit-hashes`, keeping only these paths:

```
research/probe-catalog.mjs
research/payto-summary.mjs
research/probe-402.mjs
research/check-402.sh
research/provenance-pairs.mjs
data/payto-observations.jsonl
spec/09-provenance-rules.md
spec/10-external-trust-inventory.md
```

- Author, author date, committer and committer date of every commit are unchanged.
- Commit messages are unchanged, including the short hashes they cite (they cite the Interlock
  hashes). One line was appended to each: `Moved-From: <Interlock commit URL>`.
- Commit hashes changed, because the trees changed. `git log --follow <path>` works in this repository.
- The original commits stay in Interlock. GitHub keeps `refs/pull/8/head` even if the branch is
  deleted, so the original hashes stay verifiable from the URLs below.

## The commits that fixed criteria before the numbers were seen

| Interlock | here | time (UTC, author / committer) | content |
|---|---|---|---|
| [`adf7b29`](https://github.com/kato9292929/x402-Interlock/commit/adf7b293e8354b0a15d07f75dac1695b0bc628b9) | `55a36cc` | 2026-10-08T08:06:09 / 08:06:09 | spec/09: rules for classifying the seller (provenance rules and pair definition) |
| [`a72843d`](https://github.com/kato9292929/x402-Interlock/commit/a72843d2df7e969028b8801af63bcdb336558850) | `53d8037` | 2026-10-08T09:37:02 / 09:37:02 | spec/09-2: criteria |
| [`ad1a960`](https://github.com/kato9292929/x402-Interlock/commit/ad1a960ad64cd66c1c596fe64d51a3c0abb29ca9) | `17dd2ed` | 2026-10-08T09:37:40 / 09:37:40 | spec/09-3: sampling design |
| [`1cf51e2`](https://github.com/kato9292929/x402-Interlock/commit/1cf51e2ba6f6d9c6ab0885f6186767faf649bed1) | `ce7ae14` | 2026-10-08T11:06:09 / 11:06:09 | spec/10 3-1: X, Y, Z (first version) |
| [`c856aae`](https://github.com/kato9292929/x402-Interlock/commit/c856aaebf805711fa008670be739ce41bad024c0) | `bf7d975` | 2026-10-08T13:22:45 / 13:22:50 | spec/10 3-1: W as the main measure, lines in 3-4 |
| [`2ae1a94`](https://github.com/kato9292929/x402-Interlock/commit/2ae1a94a5eece68dc8d214be857c4f57e9908a20) | `df23228` | 2026-10-08T14:06:13 / 14:06:13 | spec/10 3-1 revision 2: Solana only |
| [`c56f71a`](https://github.com/kato9292929/x402-Interlock/commit/c56f71a9b306da32a05c72b9750f68c4ef9247e2) | `c060740` | 2026-10-08T14:29:19 / 14:29:19 | spec/10: rules for separating platform-shared payTo |

Full hashes here:

```
55a36cc1b56f91ed49e7a1102d94913694fae6a1  adf7b293e8354b0a15d07f75dac1695b0bc628b9
53d80376b56a015b4906f6322b3caf11791ddab4  a72843d2df7e969028b8801af63bcdb336558850
17dd2ed6ac67b5768846a9ab39e60cf71f0a6727  ad1a960ad64cd66c1c596fe64d51a3c0abb29ca9
ce7ae14aa109b338d2000d823e290872228a4944  1cf51e2ba6f6d9c6ab0885f6186767faf649bed1
bf7d975c88dc13d4b314c1bea3b0a1e38acf0e3e  c856aaebf805711fa008670be739ce41bad024c0
df23228237b040f2d797781e954f4085e6003789  2ae1a94a5eece68dc8d214be857c4f57e9908a20
c060740f2dd00aa20972bfe1b842de646ab588c7  c56f71a9b306da32a05c72b9750f68c4ef9247e2
```

## Status of the moved files

- `spec/09-*` and `research/provenance-pairs.mjs`: the provenance investigation, which was dropped. Kept as a record.
- `spec/10-*`, `research/probe-catalog.mjs`, `research/payto-summary.mjs`, `research/probe-402.mjs`,
  `research/check-402.sh`, `data/payto-observations.jsonl`: the investigation that preceded this
  repository. Kept as they were. `data/payto-observations.jsonl` is the 2026-10-08 run in the old
  format; the ongoing record is `data/observations.jsonl` (spec/11).
- Not moved: `research/observe-sample.mjs` (spec/09-3 sampling draw) stays in Interlock, as it was
  not on the list of files to move.

## Second brief (data402 rebuild, 2026-10-08)

The rebuild brief makes data402 the one repository, in three layers: `src/census/`,
`src/budget/`, `src/receipt/`. Changes to the moved files under it:

- `research/probe-catalog.mjs`, `research/payto-summary.mjs` and `research/probe-402.mjs` moved
  to `src/census/research/` by `git mv` (`git log --follow` still reaches the Interlock
  commits). Their contents are unchanged, so the usage lines in their header comments still
  name the old `research/` paths.
- `research/check-402.sh` and `research/provenance-pairs.mjs` (spec/09, dropped) stay in `research/`.
- **`spec/08` is not moved; it is referenced** (owner's decision, 2026-10-08). It records a decision
  that was stopped (the judge model added only 6–8 subjective cases over the fixed rules, so Spend
  Guard stays `off`), about a layer data402 does not contain. The original stays the record:

  | | |
  |---|---|
  | repository | https://github.com/kato9292929/x402-Interlock (to be archived, not deleted) |
  | file | `spec/08-stage4-review-and-validation-order.md` |
  | commit read | `35cb7ffb99055fba46bef685066508771612240a` (branch `claude/tender-noether-7you3c`, PR #8; the file is unchanged there since `510d93b`) |
  | line 222 | stage 4: "モデルの上積みは6件" — added in `e38b1076b0e0817edaed25d2a505997529f8d730` (2026-10-07) |
  | line 226 | "上積みの6件は、範囲外か・過剰かという主観の領域にある" — `e38b107` |
  | line 254 | "モデルの上積みは8件で、範囲外・過剰・他で無料といった主観的な判断に限られた" — added in `2d42a1eb325c2be399642e75ad21bfb24ea77404` (2026-10-08) |
  | sections | 9 (段階4の結論), 10 (固定ルールのベースラインと、継続の判断: 評価・決定・追記) |

  Permalinks:
  https://github.com/kato9292929/x402-Interlock/blob/35cb7ffb99055fba46bef685066508771612240a/spec/08-stage4-review-and-validation-order.md#L222
  https://github.com/kato9292929/x402-Interlock/blob/35cb7ffb99055fba46bef685066508771612240a/spec/08-stage4-review-and-validation-order.md#L226
  https://github.com/kato9292929/x402-Interlock/blob/35cb7ffb99055fba46bef685066508771612240a/spec/08-stage4-review-and-validation-order.md#L254
