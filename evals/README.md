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

Cases are grouped per stack, with a `general/` bucket for cross-stack cases:

```
cases/
  <stack>/<case>/        # e.g. ios/retain-cycle/
    input.diff           # a unified diff
    expected.json        # { stack, description, should_flag[], should_not_flag[] }
  general/<case>/        # cross-stack cases (always run), e.g. trivial-doc-change
```

Cases are discovered by walking `cases/` for any directory holding an `expected.json`, so the
nesting is flexible — the `stack` field inside `expected.json` is authoritative.

- `should_flag` — issues the reviewer **must** report (true positives). Each has an `id`,
  `severity`, and a `hint` the judge uses to match semantically.
- `should_not_flag` — **noise traps**: things that must NOT be flagged (e.g. style deferred to
  SwiftLint, trivial changes). A finding matching a trap counts as a false positive.
- A finding that is neither expected nor a trap is reported as **extra** — a possibly-legit
  finding we didn't label. It's surfaced for manual review but not counted against precision.

## Running

```bash
ANTHROPIC_API_KEY=sk-ant-... node evals/run.mjs           # all cases
ANTHROPIC_API_KEY=sk-ant-... node evals/run.mjs ios       # only ios/ + general/ cases
# optional: EVAL_MODEL=claude-sonnet-4-6 ; EVAL_STACK=ios (same as the positional arg)
```

The stack filter runs cases whose `stack` matches, plus everything under `general/`.

Requires Node 18+ (uses global `fetch`; no dependencies). Each case makes 2 API calls (review +
judge), so a run costs real tokens.

## CI

`.github/workflows/evals.yml` runs the harness on PRs that touch `rules/**` or `evals/**`,
using an `ANTHROPIC_API_KEY` secret on this repo. That way every change to the rules is graded
before it ships.

## Growing the corpus

The corpus is the "live dog." When a real PR surfaces a false positive or a miss, add it as a
new case (a minimal diff + labels) so regressions are caught.

**Prioritize noise cases from real PRs.** Planted-bug cases (like the seeds here) are useful
regression guards, but the reviewer's hardest job — and the original motivation — is *staying
quiet on messy, realistic diffs that warrant few or no comments*. A corpus made only of obvious
planted bugs can score perfectly while the reviewer still over-comments in the wild. So weight
the corpus toward realistic diffs derived from actual PRs (especially ones where the reviewer
was wrong or chatty), not just synthetic fixtures.

Seeded from cases we validated live: a Combine retain cycle, a multi-issue sync service
(`ios/places-sync`), and a trivial doc change that must stay silent.
