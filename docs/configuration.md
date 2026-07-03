# Configuration

Everything a consumer can set, plus how to verify the reviewer's behavior.

## The caller workflow

Consumers add a small caller at `.github/workflows/ai-review.yml`. See
[`examples/caller.yml`](../examples/caller.yml) (single stack) and
[`examples/caller-monorepo.yml`](../examples/caller-monorepo.yml) (multi-stack). A caller job carries
only `if:` / `uses:` / `with:` / `secrets:` — all real work lives in the engine.

## Inputs (`with:`)

| Input | Required | Default | Purpose |
|---|---|---|---|
| `stack` | no | `none` | Central rule pack(s) to load. One (`ios`) or comma-separated for a monorepo (`backend,frontend`). The reviewer loads every listed pack and applies each to its own paths. `none` loads no central pack (rely on `custom_rules` and/or `general.md`). |
| `custom_rules` | no | `""` | Comma-separated paths to rule files **in the consumer repo** (e.g. `.ai-review/frontend.md,.ai-review/api.md`). Read at run time and applied as stack packs, **above** the central pack. For repos that own their own rules. See [Repo-supplied rules](#repo-supplied-rules-custom_rules). |
| `model` | no | `claude-sonnet-4-6` | Model ID passed to `claude-code-action`. Verify current IDs periodically. |
| `rules_ref` | no | `v1` | Git ref of the engine repo to load `rules/*.md` from. Pin to a tag; moves with `@v1`. |
| `max_turns` | no | `60` | Max agent turns. Raise for large or multi-stack PRs (e.g. `90`) if a run ever hits the cap. |
| `debug` | no | `false` | Print the model's full turn output (tool calls) to the job log — use to **verify** behavior, not every run (verbose). |

## Secret

- **`ANTHROPIC_API_KEY`** — the only required secret. Add it per repo or as an org-level Actions
  secret. It never lives in the (public) engine repo; each consumer passes its own.

## Permissions

The caller must grant (the engine declares the same as its maximum, and a reusable workflow can only
*reduce* the caller's token, never elevate it — so declare it in the caller too):

```yaml
permissions:
  contents: read
  pull-requests: write
```

Without `pull-requests: write` in the caller, a repo whose default token is read-only will silently
strip the engine's write access and inline comments won't post. Also ensure repo/org **Actions →
Workflow permissions** isn't hard-restricted below this.

## Triggers

The example fires on:
- `pull_request` `opened` / `ready_for_review` — automatic review.
- `issue_comment` containing **`@ai-review`** on a PR — manual (re-)review. The `@ai-review` path
  runs the workflow from the **default branch**, so the caller must be on the default branch for it
  to work.

Fork PRs receive no secrets on `pull_request`, so external-fork PRs won't auto-review — use a
maintainer's `@ai-review` comment. Do **not** switch to `pull_request_target` (untrusted-checkout
security risk).

## Pinning: `@v1` vs a commit SHA

`@v1` is a **rolling major-version tag** — consumers pick up tuning automatically. Tradeoff: it's a
floating ref your `ANTHROPIC_API_KEY` is exposed to. For a stricter supply-chain posture, pin to an
immutable SHA:

```yaml
uses: EgzonArifi/ai-code-review/.github/workflows/review.yml@<full-commit-sha>
```

Get the latest SHA: `gh api repos/EgzonArifi/ai-code-review/commits/main --jq '.sha'`. Re-pin when
you want upstream changes.

## Monorepo (multi-stack)

Pass `stack: backend,frontend`. Both packs load; each applies to its own paths (backend rules to
`apps/be`, frontend rules to `apps/fe`/`admin`/`ui`). Bump `max_turns` if a large multi-stack PR
hits the cap.

## Repo-supplied rules: `custom_rules`

A consumer can supply its **own** rule files instead of (or on top of) a central stack pack — useful
for repos **not created from a stack template**, or with a stack that has no central pack yet. The
developer writes rule file(s) in their repo and passes their paths:

```yaml
with:
  stack: none                                          # skip central packs
  custom_rules: .ai-review/frontend.md,.ai-review/api.md
```

- Paths are **relative to the consumer repo root** and read at run time from the checked-out PR head
  (the same place `REVIEW.md` is read). A path that doesn't exist is skipped and noted in the eval log.
- Each file is applied as a **stack pack**, ranking **above** the central pack. `general.md` always
  loads underneath.
- Combine with a central pack to layer: `stack: frontend` + `custom_rules: .ai-review/overrides.md`.
- Write these files in the shape described in
  [authoring rule packs](authoring-rule-packs.md#a-stack-pack-iosmd-androidmd-backendmd-frontendmd).
- **Trust note:** because they're read from the PR head, a PR can edit its own review rules. Fine for
  internal repos; if that matters, keep the rules on a protected branch and review changes to them.

See [`examples/caller-custom-rules.yml`](../examples/caller-custom-rules.yml).

## Per-repo overrides: `REVIEW.md`

If a consumer repo has a `REVIEW.md` at its root, the reviewer reads it as the **highest-priority**
overrides (above `custom_rules`, the stack pack, and `general.md`). Use it to add repo-specific
must-checks, tighten or relax severity, or extend skip globs for that repo only.

Full precedence: **`REVIEW.md` > `custom_rules` files > central stack pack > `general.md`**.

## Verifying the independent judge

The judge is prompt-instructed within a single run. To confirm it actually runs as a *separate*
sub-agent (not the main agent self-judging), set `debug: true` in the caller and inspect the run log:

```bash
gh run view <run-id> --repo <owner/repo> --log \
  | grep -E '"name": "Agent"|parent_tool_use_id": "[a-z]'
```

Evidence the judge ran independently:
- an `Agent` (a.k.a. `Task`) tool-use whose `description` is `Independent judge for PR review candidates`, and
- one or more `parent_tool_use_id` values that are **non-null** (the judge's own nested tool calls).

`debug` also surfaces the full turn output via the action's `show_full_output`, so `--debug` output
actually reaches the job log (it's otherwise buffered by the action). Turn `debug` back off for
normal runs — it's verbose.

## Reading the evaluation log

Every run publishes it to the run **Summary** page (Actions → the run → Summary), and to job stdout
between `===== AI REVIEW EVALUATION LOG (begin/end) =====` markers. It lists every candidate — kept
and dropped — with the judge's verdict, confidence, and reason. It is never posted to the PR.
