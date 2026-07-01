#!/usr/bin/env node
// Reference-free audit: run the reviewer's RULES over REAL pull-request diffs and
// judge each finding on its own merits — no hand-written labels required.
//
// It measures noise / precision (the property we actually care about): of the
// findings the reviewer would post, how many are valid and worth posting?
// It cannot measure recall (unknown misses) — the tiny labeled corpus (run.mjs)
// covers that.
//
// Usage:
//   ANTHROPIC_API_KEY=... node evals/audit.mjs --repo owner/name --last 5 [--stack ios]
//   ANTHROPIC_API_KEY=... node evals/audit.mjs --repo owner/name 81 95 98 [--stack ios]
//
// Requires the `gh` CLI, authenticated with read access to the target repo.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { anthropic, extractJson, reviewDiff, API_KEY } from './lib.mjs';

const exec = promisify(execFile);
const MAX_DIFF_CHARS = 60000; // cap to avoid token blowups on huge PRs
const KEEP = { valid: 7, relevant: 6 }; // a finding "should post" if it clears both

if (!API_KEY) {
  console.error('ANTHROPIC_API_KEY is not set.');
  process.exit(2);
}

// ---- args ----
const argv = process.argv.slice(2);
function optVal(flag) {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
}
const repo = optVal('--repo');
const stack = optVal('--stack') || 'ios';
const last = optVal('--last');
const explicitPRs = argv.filter((a) => /^\d+$/.test(a));

if (!repo) {
  console.error('Missing --repo owner/name');
  process.exit(2);
}

async function gh(args) {
  const { stdout } = await exec('gh', args, { maxBuffer: 20 * 1024 * 1024 });
  return stdout;
}

// Resolve the list of PR numbers to audit.
let prNumbers = explicitPRs.map(Number);
if (!prNumbers.length) {
  const n = Number(last || 5);
  const out = await gh(['pr', 'list', '--repo', repo, '--state', 'merged', '-L', String(n), '--json', 'number']);
  prNumbers = JSON.parse(out).map((p) => p.number);
}
if (!prNumbers.length) {
  console.error('No PRs to audit.');
  process.exit(2);
}
console.log(`Auditing ${repo} PRs: ${prNumbers.join(', ')} (stack: ${stack})\n`);

// Reference-free judge: score a single finding against the diff, no gold label.
async function judgeFinding(diff, finding) {
  const system =
    `You are a strict, skeptical judge auditing an automated code review for NOISE. ` +
    `Given a PR diff and ONE finding the reviewer wants to post, decide if it is worth posting.\n` +
    `Score two axes 0-10:\n` +
    `- "valid": is the finding technically correct given the code in the diff? (fabricated/wrong = low)\n` +
    `- "relevant": is it worth a reviewer's comment? Low if it is trivial, subjective, speculative, ` +
    `duplicative, or something a linter/formatter/compiler already enforces.\n` +
    `Default to LOW when uncertain — false positives are the thing we are hunting.\n` +
    `Output ONLY JSON: {"valid":number,"relevant":number,"reason":string}`;
  const user = `DIFF:\n${diff}\n\nFINDING:\n${JSON.stringify(finding)}`;
  return extractJson(await anthropic(system, user, 800));
}

const agg = { findings: 0, kept: 0, noise: 0, sumValid: 0, sumRelevant: 0 };

for (const num of prNumbers) {
  let diff;
  try {
    diff = await gh(['pr', 'diff', String(num), '--repo', repo]);
  } catch (err) {
    console.log(`## PR #${num}\n  ERROR fetching diff: ${err.message}\n`);
    process.exitCode = 2;
    continue;
  }
  let truncated = false;
  if (diff.length > MAX_DIFF_CHARS) {
    diff = diff.slice(0, MAX_DIFF_CHARS);
    truncated = true;
  }

  let result;
  try {
    result = await reviewDiff(stack, diff);
  } catch (err) {
    console.log(`## PR #${num}\n  ERROR reviewing: ${err.message}\n`);
    process.exitCode = 2;
    continue;
  }

  const findings = result.findings || [];
  console.log(`## PR #${num}${truncated ? ' (diff truncated)' : ''} — ${findings.length} finding(s)`);

  for (const f of findings) {
    let j;
    try {
      j = await judgeFinding(diff, f);
    } catch (err) {
      console.log(`  ? ${f.title} — judge error: ${err.message}`);
      continue;
    }
    const keep = j.valid >= KEEP.valid && j.relevant >= KEEP.relevant;
    agg.findings++;
    agg.sumValid += j.valid;
    agg.sumRelevant += j.relevant;
    if (keep) agg.kept++; else agg.noise++;
    console.log(
      `  ${keep ? '✓' : '✗ NOISE'} [valid ${j.valid}/rel ${j.relevant}] ${f.severity}: ${f.title}`
    );
    if (!keep) console.log(`      ↳ ${j.reason}`);
  }
  if (!findings.length) console.log('  (silent)');
  console.log('');
}

const noiseRate = agg.findings ? agg.noise / agg.findings : 0;
console.log('=== TOTALS ===');
console.log(
  `findings=${agg.findings}  kept=${agg.kept}  noise=${agg.noise}  ` +
  `noise_rate=${(noiseRate * 100).toFixed(0)}%  ` +
  `avg_valid=${(agg.sumValid / (agg.findings || 1)).toFixed(1)}  ` +
  `avg_relevant=${(agg.sumRelevant / (agg.findings || 1)).toFixed(1)}`
);
console.log('\nTip: findings marked ✗ NOISE are candidates to turn into regression cases, or to tune general.md against.');
