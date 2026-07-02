# Authoring & tuning rule packs

The rules are the product. This is how they're structured and how to add or tune one.

## Layering & priority

Every review loads, in increasing priority:

1. **`rules/general.md`** — cross-stack philosophy + noise control. Always loaded.
2. **`rules/<stack>.md`** — the stack pack(s) named in the `stack` input.
3. **`REVIEW.md`** at the consumer repo root, if present — per-repo overrides.

When they conflict: **`REVIEW.md` > stack pack > `general.md`**.

## `general.md` — the noise-control core

Holds the parts that are the same for every stack:

- **Tunable knobs** (named values at the top — the single place to dial noise, propagated to all
  consumers via `rules_ref`): `CONFIDENCE_THRESHOLD` (default 80), `NIT_CONFIDENCE_THRESHOLD` (90),
  `MAX_NITS` (5), `TRIVIAL_DIFF_LINES` (15), `SUBSTANTIAL_DIFF_LINES` (150).
- **Scoring model** — severity tiers, the confidence gate, and the **independent judge gate**
  (candidates judged by a separate sub-agent that never saw the finder's reasoning).
- **Pipeline** — pre-flight skip, size gate, judge, dedupe, report.
- **What NOT to report** — anything CI/linters enforce, pre-existing issues, missing coverage
  (except risky new logic), generated/vendored code, subjective style, speculation.
- **Output** — inline comment shape and the structured verdict template.

Tune `general.md` when the change is cross-stack (e.g. raise the threshold, cap nits differently,
adjust the verdict). Validate with the [reference-free audit](../evals/README.md) before shipping.

## A stack pack (`ios.md`, `android.md`, `backend.md`, `frontend.md`)

Each pack follows the same shape and exists to encode **what this stack's toolchain already covers
(defer) and what it can't (focus)**:

1. **Applies to** — the paths this pack governs (matters for monorepos).
2. **Defer to the toolchain — do NOT flag** — everything the stack's linters/formatters/type
   checker/CI already enforce (re-flagging it is pure noise). Be specific and accurate to the real
   config — e.g. iOS defers to SwiftLint (`force_unwrapping`, length, `print`); the monorepo defers
   to Biome + Oxlint (type-aware) + `tsc` strict.
3. **Defer to project skills / conventions** (if any) — reference them, don't re-derive (e.g. iOS
   points at the repo's `.agents/skills/` for MVVM/AtlasUI/concurrency).
4. **Focus here — what the toolchain & compiler miss** — the high-value correctness classes: for
   this codebase's patterns, not generic advice (retain cycles & actor isolation for iOS; unscoped
   Prisma queries & floating promises for backend; hook-dep/stale-closure bugs for frontend since
   `react/exhaustive-deps` is off; `GlobalScope`/Compose-lifecycle for Android).
5. **Skip entirely** — generated/vendored/build globs for the stack.

## Adding a new stack pack

1. **Inventory the target template/repo** first — the pack is only as good as its grounding. Nail
   down: what the linters/CI actually enforce (to defer), the generated/skip paths, the stack's
   libraries/patterns, and the correctness classes tools miss. (For the existing packs this was done
   against `ios-template`, `monorepo-playground`, and `android-compose-template`.)
2. Write `rules/<stack>.md` in the shape above. Keep it **focused** — a tight, principled pack beats
   an exhaustive checklist (long packs dilute the rules that matter).
3. Add an `examples/` caller note if the stack needs one; update the README stack list.
4. **Validate** on a real PR: pin a caller to a SHA with `stack: <new>`, open a PR with a couple of
   genuine issues + a noise trap (something the linter owns, which must NOT be flagged), and confirm
   the reviewer catches the real ones and stays silent on the trap. Then roll `v1`.

## The structured verdict

The single top-level comment every review posts. Fixed shape; **omit any empty section** (no empty
headers → no noise):

```
## 🤖 AI review

**Merge confidence:** <🟢 High | 🟡 Medium | 🔴 Low> — <one-line rationale>

**Must fix before merge:**     ← only if there are 🔴 Important findings
- `file:line` — <blocker>

**Findings:** <X important, Y nits>[ · N dropped (see run Summary)]

**Risk areas touched:**        ← only if the PR changes a sensitive surface
- <auth | migration | billing | data deletion | concurrency | public API | secrets> — <where>

**Open questions:**            ← only if any (≤3, correctness-relevant)
- <ambiguity that couldn't be resolved from the code>

**Notes:**                     ← only if any
- <non-blocking context>
```

**Merge-confidence rubric** (advisory — not a GitHub approval):
- 🟢 **High** — no 🔴 findings and no open questions.
- 🟡 **Medium** — no 🔴, but nits and/or open questions.
- 🔴 **Low** — one or more 🔴 findings; address before merge.

`Risk areas touched` is shown **even when there are no findings** — it tells a human where to look.
`Open questions` are capped and must be real correctness ambiguities (never "consider adding a test").

## Validating rule changes

Use the reference-free audit before shipping a rules change — it runs the real packs over real PR
diffs and scores the findings for noise, no hand-written labels. See
[`evals/README.md`](../evals/README.md).
