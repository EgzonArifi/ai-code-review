#!/usr/bin/env node
// Offline eval harness for the AI code reviewer.
//
// For each labeled case it:
//   1) runs the REAL rules/*.md over the case diff (one Anthropic API call) to
//      produce structured findings, then
//   2) uses an LLM judge to map those findings against the gold labels and
//      compute precision / recall / false-positives.
//
// It exits non-zero if aggregate metrics fall below THRESHOLDS, so it can gate
// rules changes in CI.
//
// NOTE: this exercises the RULES via a single model call. It does NOT replicate
// the GitHub Action's full runtime (subagent fan-out, git-blame). It is a
// rules-tuning signal, not a full-system integration test.
//
// Usage:  ANTHROPIC_API_KEY=sk-ant-... node evals/run.mjs
// Env:    EVAL_MODEL (default claude-sonnet-4-6)

import { readFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const REPO = join(ROOT, '..');
const MODEL = process.env.EVAL_MODEL || 'claude-sonnet-4-6';
const API_KEY = process.env.ANTHROPIC_API_KEY;
const THRESHOLDS = { precision: 0.9, recall: 0.9, maxFalsePositives: 0 };

if (!API_KEY) {
  console.error('ANTHROPIC_API_KEY is not set.');
  process.exit(2);
}

async function anthropic(system, user, maxTokens = 3000) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data.content || []).map((c) => c.text || '').join('');
}

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.search(/[[{]/);
  if (start < 0) throw new Error(`No JSON found in model output:\n${text}`);
  return JSON.parse(raw.slice(start));
}

async function loadRules(stack) {
  let rules = await readFile(join(REPO, 'rules', 'general.md'), 'utf8');
  for (const s of stack.split(',').map((x) => x.trim()).filter(Boolean)) {
    try {
      rules += `\n\n# rules/${s}.md\n` + (await readFile(join(REPO, 'rules', `${s}.md`), 'utf8'));
    } catch {
      /* stack pack may not exist yet */
    }
  }
  return rules;
}

async function reviewCase(meta, diff) {
  const rules = await loadRules(meta.stack);
  const system =
    `You are an automated pull-request reviewer. Follow these rules EXACTLY:\n\n${rules}\n\n` +
    `Apply the confidence gate, verification, proportionality, and all suppression rules.\n` +
    `Output ONLY a JSON object of the form:\n` +
    `{"findings":[{"file":string,"line":number,"severity":"important"|"nit"|"pre-existing","confidence":number,"title":string,"body":string}],"summary":string}\n` +
    `If nothing clears the bar, return an empty findings array.`;
  const user = `Review this diff for a "${meta.stack}" project.\n\nDIFF:\n${diff}`;
  return extractJson(await anthropic(system, user, 3000));
}

async function grade(meta, diff, result) {
  const system =
    `You are a strict grader for an automated code reviewer. You are given a diff, the GOLD ` +
    `expectations, and the reviewer's ACTUAL findings. Map them semantically (line numbers may differ).\n` +
    `Output ONLY JSON:\n` +
    `{"matched":[should_flag_id...],"missed":[should_flag_id...],` +
    `"false_positives":[{"trap_id":string|null,"title":string,"why":string}],` +
    `"extra":[{"title":string,"why_might_be_ok":string}]}\n` +
    `Rules:\n` +
    `- "matched": a should_flag item that an actual finding correctly reports.\n` +
    `- "missed": a should_flag item that no actual finding reports.\n` +
    `- "false_positives": an actual finding that matches a should_not_flag trap (set trap_id), ` +
    `OR is clearly wrong/nonexistent given the diff (trap_id null).\n` +
    `- "extra": an actual finding that is neither expected nor a trap — a plausibly-legit finding ` +
    `we did not label. List it; it is NOT counted as a false positive.`;
  const user = JSON.stringify(
    { diff, should_flag: meta.should_flag || [], should_not_flag: meta.should_not_flag || [], actual_findings: result.findings || [] },
    null,
    2
  );
  return extractJson(await anthropic(system, user, 2000));
}

const casesDir = join(ROOT, 'cases');
const dirs = (await readdir(casesDir, { withFileTypes: true })).filter((d) => d.isDirectory());
if (!dirs.length) {
  console.error('No cases found under evals/cases/');
  process.exit(2);
}

const agg = { tp: 0, fn: 0, fp: 0, extra: 0 };
for (const d of dirs) {
  const dir = join(casesDir, d.name);
  const meta = JSON.parse(await readFile(join(dir, 'expected.json'), 'utf8'));
  const diff = await readFile(join(dir, 'input.diff'), 'utf8');

  let result, g;
  try {
    result = await reviewCase(meta, diff);
    g = await grade(meta, diff, result);
  } catch (err) {
    console.log(`\n## ${d.name}\n  ERROR: ${err.message}`);
    process.exitCode = 2;
    continue;
  }

  const tp = g.matched.length;
  const fn = g.missed.length;
  const fp = g.false_positives.length;
  const extra = (g.extra || []).length;
  agg.tp += tp; agg.fn += fn; agg.fp += fp; agg.extra += extra;

  console.log(`\n## ${d.name}`);
  console.log(`  posted=${(result.findings || []).length} matched=${tp} missed=${fn} false_positives=${fp} extra=${extra}`);
  if (fn) console.log('  MISSED: ' + g.missed.join(', '));
  if (fp) console.log('  FALSE POSITIVES: ' + g.false_positives.map((f) => f.title).join('; '));
  if (extra) console.log('  extra (unlabeled, review manually): ' + g.extra.map((f) => f.title).join('; '));
}

const precision = agg.tp + agg.fp ? agg.tp / (agg.tp + agg.fp) : 1;
const recall = agg.tp + agg.fn ? agg.tp / (agg.tp + agg.fn) : 1;

console.log(`\n=== TOTALS ===`);
console.log(`precision=${precision.toFixed(2)}  recall=${recall.toFixed(2)}  false_positives=${agg.fp}  extra=${agg.extra}`);

let fail = false;
if (precision < THRESHOLDS.precision) { console.log(`FAIL: precision ${precision.toFixed(2)} < ${THRESHOLDS.precision}`); fail = true; }
if (recall < THRESHOLDS.recall) { console.log(`FAIL: recall ${recall.toFixed(2)} < ${THRESHOLDS.recall}`); fail = true; }
if (agg.fp > THRESHOLDS.maxFalsePositives) { console.log(`FAIL: false_positives ${agg.fp} > ${THRESHOLDS.maxFalsePositives}`); fail = true; }

if (!fail) console.log('PASS');
process.exit(fail ? 1 : process.exitCode || 0);
