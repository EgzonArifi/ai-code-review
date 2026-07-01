# Evals — offline grading for the reviewer

A small harness that measures the reviewer's **signal vs. noise** so `rules/*.md` can be tuned
with evidence instead of vibes. It runs the real rule packs over a set of labeled cases and
grades the findings with an LLM judge.

## How it works

For each case under `cases/<name>/`:

1. `run.mjs` loads `rules/general.md` + the case's stack pack, applies them to `input.diff`
   via one Anthropic API call, and gets structured findings back.
2. An LLM judge maps those findings against the gold labels in `expected.json` and reports
   **matched (TP) / missed (FN) / false-positives (FP) / extra (unlabeled)**.
3. Aggregate **precision / recall / false-positives** are printed; the process exits non-zero if
   they fall below the thresholds in `run.mjs` (`precision ≥ 0.9`, `recall ≥ 0.9`, `FP = 0`).

> Scope: this exercises the **rules** via a single model call. It does not replicate the GitHub
> Action's full runtime (subagent fan-out, git-blame). It's a rules-tuning signal, not a
> full-system integration test.

## Case format

```
cases/<name>/
  input.diff        # a unified diff
  expected.json     # { stack, description, should_flag[], should_not_flag[] }
```

- `should_flag` — issues the reviewer **must** report (true positives). Each has an `id`,
  `severity`, and a `hint` the judge uses to match semantically.
- `should_not_flag` — **noise traps**: things that must NOT be flagged (e.g. style deferred to
  SwiftLint, trivial changes). A finding matching a trap counts as a false positive.
- A finding that is neither expected nor a trap is reported as **extra** — a possibly-legit
  finding we didn't label. It's surfaced for manual review but not counted against precision.

## Running

```bash
ANTHROPIC_API_KEY=sk-ant-... node evals/run.mjs
# optional: EVAL_MODEL=claude-sonnet-4-6
```

Requires Node 18+ (uses global `fetch`; no dependencies). Each case makes 2 API calls (review +
judge), so a run costs real tokens.

## CI

`.github/workflows/evals.yml` runs the harness on PRs that touch `rules/**` or `evals/**`,
using an `ANTHROPIC_API_KEY` secret on this repo. That way every change to the rules is graded
before it ships.

## Growing the corpus

The corpus is the "live dog." When a real PR surfaces a false positive or a miss, add it as a
new case (a minimal diff + labels) so regressions are caught. Seeded from the first two cases we
validated live: a Combine retain cycle (must flag) and a trivial doc change (must stay silent).
