// Shared helpers for the eval tooling (labeled harness + reference-free audit).

import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const MODEL = process.env.EVAL_MODEL || 'claude-sonnet-4-6';
export const API_KEY = process.env.ANTHROPIC_API_KEY;

export async function anthropic(system, user, maxTokens = 3000) {
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

export function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.search(/[[{]/);
  if (start < 0) throw new Error(`No JSON found in model output:\n${text}`);
  return JSON.parse(raw.slice(start));
}

export async function loadRules(stack) {
  let rules = await readFile(join(REPO_ROOT, 'rules', 'general.md'), 'utf8');
  for (const s of String(stack || '').split(',').map((x) => x.trim()).filter(Boolean)) {
    try {
      rules += `\n\n# rules/${s}.md\n` + (await readFile(join(REPO_ROOT, 'rules', `${s}.md`), 'utf8'));
    } catch {
      /* stack pack may not exist yet */
    }
  }
  return rules;
}

// Applies the real rule packs to a diff and returns structured findings.
export async function reviewDiff(stack, diff) {
  const rules = await loadRules(stack);
  const system =
    `You are an automated pull-request reviewer. Follow these rules EXACTLY:\n\n${rules}\n\n` +
    `Apply the confidence gate, verification, proportionality, and all suppression rules.\n` +
    `Output ONLY a JSON object of the form:\n` +
    `{"findings":[{"file":string,"line":number,"severity":"important"|"nit"|"pre-existing","confidence":number,"title":string,"body":string}],"summary":string}\n` +
    `If nothing clears the bar, return an empty findings array.`;
  const user = `Review this diff for a "${stack}" project.\n\nDIFF:\n${diff}`;
  return extractJson(await anthropic(system, user, 3000));
}
