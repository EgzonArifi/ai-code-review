# ai-code-review

A centralized, platform-agnostic **AI code reviewer** for GitHub pull requests — the engine and the rule packs live here once, and any repo (in any org) opts in with a ~15-line caller workflow.

Built on Anthropic's [`claude-code-action`](https://github.com/anthropics/claude-code-action). The review **rules** are a provider-neutral markdown layer, so the engine can be swapped later without rewriting them.

## Why this exists

Off-the-shelf AI reviewers are noisy — they comment on trivial one-line changes and re-flag what CI/linters already enforce. This project's core goal is **high signal, low noise**, tuned gradually and centrally (a "live dog"). It targets repos that lack a dedicated reviewer or where developers work solo, across iOS / Android / React Native / backend / frontend / monorepos.

Anthropic ships a hosted [Code Review](https://code.claude.com/docs/en/code-review) product that does much of this, but customizes **per-repo only**. This engine's reason to exist is **centralized, versioned, per-stack rule packs shared across many repos and orgs**, with a single point of update.

## How it works

- `.github/workflows/review.yml` — reusable workflow (`on: workflow_call`) that checks out the PR, loads the rule packs, and runs the reviewer via `claude-code-action`.
- `rules/` — the durable, tunable asset:
  - `general.md` — cross-stack philosophy + noise control (severity tiers, a 0–100 confidence gate, an **independent judge**, skip logic, the structured verdict).
  - `ios.md`, `android.md` (Kotlin + Compose), `backend.md` (NestJS + Prisma), `frontend.md` (React + Vite + TanStack) — per-stack packs, added one at a time; `react-native.md` next.
- `examples/caller.yml` (single stack), `examples/caller-monorepo.yml` (`stack: backend,frontend`), and `examples/caller-custom-rules.yml` (repo-supplied rules) — copy-paste snippets consumers add to opt in.

The reviewer scales scrutiny to PR size (trivial PRs get a single quick pass; substantial ones fan out into dimension sub-agents). Findings are then handed to a **separate, independent judge sub-agent** — it never sees the finder's reasoning — which assigns each a 0–100 confidence; only judge-confirmed findings post. Output is inline comments plus one **structured verdict** (merge confidence, must-fix blockers, findings tally, risk areas, open questions) and a workflow-only **evaluation log** of everything considered, kept and dropped.

## Documentation

- [docs/architecture.md](docs/architecture.md) — the full pipeline, the independent judge, output, distribution.
- [docs/configuration.md](docs/configuration.md) — inputs, secret, permissions, triggers, pinning, monorepo, and verifying the judge.
- [docs/authoring-rule-packs.md](docs/authoring-rule-packs.md) — how the rules layer works and how to add/tune a stack pack.

## Visibility

This repo is intentionally **public**. Consumers span multiple GitHub orgs, and GitHub only lets a repo call a reusable workflow from another org if that workflow's repo is public. The repo holds only workflow YAML and markdown guidelines — no secrets, no client code.

## Consuming it

Add a caller workflow (see [`examples/caller.yml`](examples/caller.yml)) to your repo and set an `ANTHROPIC_API_KEY` secret — the only required secret. For a monorepo, pass multiple stacks (`stack: backend,frontend`). Pin to `@v1` (rolling, auto-updates) or an immutable SHA for a stricter supply-chain posture. Full details — inputs, permissions, triggers, pinning — in [docs/configuration.md](docs/configuration.md).

### Repos with their own rules (custom_rules)

A repo doesn't need a central stack pack — it can supply its **own** rule files. This suits projects **not created from a stack template**, or ones with idiosyncratic rules. The developer writes rule file(s) in their repo and points the caller at them:

```yaml
with:
  stack: none                                          # skip central packs…
  custom_rules: .ai-review/frontend.md,.ai-review/api.md   # …use the repo's own rules
```

The engine reads those paths from the consumer repo at run time and applies them as stack packs. `general.md` (correctness + noise control) always loads underneath, and you can still layer on top of a central pack (e.g. `stack: frontend` + `custom_rules: .ai-review/overrides.md`). Precedence: **`REVIEW.md` > `custom_rules` files > central stack pack > `general.md`**. See [`examples/caller-custom-rules.yml`](examples/caller-custom-rules.yml). For a one-file per-repo tweak with no caller change, `REVIEW.md` at the repo root still works (highest priority).

## Status

Engine + iOS / Android / backend / frontend packs, independent judge, structured verdict, and the reference-free eval audit are in place and validated. `react-native.md` is the next stack pack.
