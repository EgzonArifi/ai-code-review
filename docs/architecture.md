# Architecture

How the reviewer works end to end, and why it's built this way.

## Shape

```
consumer repo (.github/workflows/ai-review.yml)   ← ~15-line caller
        │  uses: EgzonArifi/ai-code-review/.github/workflows/review.yml@v1
        ▼
EgzonArifi/ai-code-review (PUBLIC)
  .github/workflows/review.yml   ← the engine (reusable workflow)
  rules/*.md                     ← the durable, tunable asset
```

The **engine** (`review.yml`) is a thin, reusable GitHub Actions workflow. The **rules** (`rules/*.md`)
are a provider-neutral markdown layer that holds all review behavior. If the engine is ever swapped
for a different runner, the rules carry over unchanged.

The engine wraps Anthropic's [`claude-code-action`](https://github.com/anthropics/claude-code-action)
and drives it with a **hand-written prompt** (not the packaged `code-review` plugin) — chosen for
deterministic control over noise suppression, severity, and the structured verdict, with no
marketplace dependency.

## The run, step by step (`review.yml`)

1. **Resolve PR** — compute the PR number + head SHA. Handles both `pull_request` and
   `issue_comment` (`@ai-review`) events (the latter has no `pull_request` object, and its default
   checkout would grab the default branch, not the PR head).
2. **Checkout PR head** at `fetch-depth: 0` (git blame/history needs full depth).
3. **Checkout rule packs** from this public repo into `.ai-review/`, pinned via `rules_ref`
   (default `v1`). No token — public repo.
4. **Run the reviewer** (`claude-code-action`) with the hand-written prompt below. Advisory and
   **best-effort**: the step is `continue-on-error: true`, so a turn-cap hit or transient API error
   never fails the PR's checks.
5. **Publish evaluation log** — always runs; prints the reviewer's per-candidate log to the run
   **Summary** page and job stdout (see [Evaluation log](#evaluation-log)).

## The review pipeline (inside the prompt)

Lean and **size-gated** so cost tracks value:

1. **Pre-flight** — skip closed/draft PRs; trivial diffs get at most a one-line confirmation.
2. **Find** candidate issues.
   - Trivial/small PRs → a single pass across all dimensions.
   - Substantial PRs → **fan out** into parallel dimension sub-agents (via the `Agent`/`Task`
     tool): (a) bugs/correctness, (b) rules-compliance, (c) git-history/blame for introduced-vs-
     pre-existing. Fan-out improves *recall* on big PRs; it is not what controls noise.
3. **Independent judge (the noise control).** The finder does **not** judge its own work.
   - Each candidate is reduced to a **neutral claim** — `file:line` + what is allegedly wrong —
     with the finder's justification and proposed severity stripped.
   - One **batched judge sub-agent** (a fresh `Agent`/`Task` that never sees the finder's
     reasoning) verifies each claim against the code, assigns the **0–100 confidence**, and returns
     keep/drop + reason. It defaults to drop when uncertain.
   - Only claims the judge confirms at/above the threshold survive. **The judge's confidence is
     authoritative** — it's what appears inline and in the eval log.
4. **Report** — post surviving findings as inline comments, one structured verdict, and write the
   eval log.

Why independence matters: an agent grading its own findings is biased toward keeping them. The
separate judge is what makes the confidence gate meaningful. See
[Verifying the judge](configuration.md#verifying-the-independent-judge) to confirm it actually runs.

## Scoring model

- **Severity tiers** (presentation): 🔴 Important / 🟡 Nit / 🟣 Pre-existing.
- **Confidence 0–100** (the gate): drop below `CONFIDENCE_THRESHOLD` (default 80; nits 90). These
  are named knobs at the top of `general.md` — the single place to tune noise, propagated to all
  consumers via `rules_ref`.
- Advisory only — the reviewer **never approves or blocks** a PR.

## Output

- **Inline comments** — one per surviving finding, on the exact `file:line`, tagged with severity
  and the judge's confidence (e.g. `🔴 [conf 92]`), with a brief why and a suggested fix when small.
- **Structured verdict** — one top-level comment, fixed shape (empty sections omitted):
  Merge confidence (🟢/🟡/🔴 + rationale) · Must fix before merge · Findings tally · Risk areas
  touched · Open questions · Notes. See [the verdict spec](authoring-rule-packs.md#the-structured-verdict).
- **Evaluation log** — a workflow-only record (never posted to the PR): a markdown table of *every*
  candidate the reviewer considered, **kept and dropped**, with the judge's verdict/confidence/reason.
  Written to `.ai-review-log.md` and published to the run **Summary** page. This is how you see what
  the reviewer suppressed and why.

## Distribution & visibility

The engine repo is **public** on purpose: GitHub only lets a repo call a reusable workflow from
another org if that workflow's repo is public, and consumers span multiple orgs. The repo holds only
workflow YAML + markdown — no secrets, no client code. Each consumer supplies its own
`ANTHROPIC_API_KEY` and runs the reviewer in its own CI. See
[configuration](configuration.md) for pinning and the supply-chain tradeoff.
