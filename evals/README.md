# Evals — reference-free audit of the reviewer

Measures the reviewer's **noise / precision** on **real pull requests**, with no hand-written
labels. It runs the actual rule packs over real PR diffs and a skeptical LLM judge scores each
finding on its own merits, reporting a **noise rate**. This is the property we care about — "is
the reviewer chatty/wrong on real diffs?" — measured cheaply and representatively.

- `audit.mjs` — the tool.
- `lib.mjs` — shared rule-loading + review call (also reusable if a labeled harness is ever
  re-added).

## How it works

For each PR:

1. `audit.mjs` fetches the diff via `gh`, applies `rules/general.md` + the stack pack, and gets
   structured findings.
2. A skeptical judge scores each finding 0–10 on **valid** (technically correct given the code)
   and **relevant** (worth a comment — low if trivial, subjective, speculative, or a linter's
   job), defaulting low when uncertain.
3. Findings clearing both thresholds are `✓ kept`; the rest are `✗ NOISE`. Aggregate **noise
   rate** and average scores are printed.

## Scope & limitations (read this)

- **Precision, not recall.** The audit only sees what the reviewer *did* post, so it measures
  noise/false-positives — not *misses* (unknown recall). If recall guarding matters later, add a
  small labeled harness back (`lib.mjs` still exports `reviewDiff`).
- **LLM-judge.** The judge is itself a model scoring a model. Treat the noise rate as
  *directional*, and spot-check the `✗ NOISE` reasons.
- **Rules, not the full runtime.** Like the deployed reviewer it uses the same `rules/*.md`, but
  via a single API call — no subagent fan-out or git-blame. It's a rules-tuning signal.

## Running

```bash
# Last 5 merged PRs of a repo:
ANTHROPIC_API_KEY=sk-ant-... node evals/audit.mjs --repo waybacklabs/CrossedPaths --last 5 --stack ios
# Specific PRs:
ANTHROPIC_API_KEY=sk-ant-... node evals/audit.mjs --repo waybacklabs/CrossedPaths 81 98 --stack ios
```

Requires Node 18+ and the `gh` CLI authenticated with read access to the target repo. Options:
`--repo owner/name` (required), `--stack ios` (default `ios`), `--last N` or explicit PR numbers,
`EVAL_MODEL` (default `claude-sonnet-4-6`). Huge diffs are truncated (`MAX_DIFF_CHARS`).

> Not run in CI: auditing a private consumer repo needs read access to *that* repo, which the
> engine repo's CI doesn't have. Run it locally against the repos you're tuning for.

## Using it to tune

Run the audit, look at the `✗ NOISE` findings and their reasons, adjust `rules/general.md` or the
stack pack, and re-run to confirm the noise rate drops. Later, the passive 👍/👎 signal on real
posted comments is the ground-truth complement to this.
