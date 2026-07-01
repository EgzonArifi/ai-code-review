# ai-code-review

A centralized, platform-agnostic **AI code reviewer** for GitHub pull requests — the engine and the rule packs live here once, and any repo (in any org) opts in with a ~15-line caller workflow.

Built on Anthropic's [`claude-code-action`](https://github.com/anthropics/claude-code-action). The review **rules** are a provider-neutral markdown layer, so the engine can be swapped later without rewriting them.

## Why this exists

Off-the-shelf AI reviewers are noisy — they comment on trivial one-line changes and re-flag what CI/linters already enforce. This project's core goal is **high signal, low noise**, tuned gradually and centrally (a "live dog"). It targets repos that lack a dedicated reviewer or where developers work solo, across iOS / Android / React Native / backend / frontend / monorepos.

Anthropic ships a hosted [Code Review](https://code.claude.com/docs/en/code-review) product that does much of this, but customizes **per-repo only**. This engine's reason to exist is **centralized, versioned, per-stack rule packs shared across many repos and orgs**, with a single point of update.

## How it works

- `.github/workflows/review.yml` — reusable workflow (`on: workflow_call`) that checks out the PR, loads the rule packs, and runs the reviewer.
- `rules/` — the durable asset:
  - `general.md` — cross-stack philosophy + noise control (severity tiers, a 0–100 confidence gate, verification pass, skip logic).
  - `ios.md`, and later `android.md` / `react-native.md` / `backend.md` / `frontend.md` — per-stack packs, added one at a time.
- `examples/caller.yml` — the copy-paste snippet consumers add to opt in.

The reviewer scales scrutiny to PR size: trivial PRs get a single fast pass; substantial PRs fan out into dimension subagents (bugs / rules-compliance / git-history), then a confidence gate (≥80) and verification pass filter the findings before they are posted as inline comments.

## Visibility

This repo is intentionally **public**. Consumers span multiple GitHub orgs, and GitHub only lets a repo call a reusable workflow from another org if that workflow's repo is public. The repo holds only workflow YAML and markdown guidelines — no secrets, no client code.

## Consuming it

Add a caller workflow (see [`examples/caller.yml`](examples/caller.yml)) to your repo and set an `ANTHROPIC_API_KEY` secret. That's the only required secret.

## Status

Early / engine-first. Build order: engine skeleton → iOS pack → tag `v1` → additional platform packs incrementally.
