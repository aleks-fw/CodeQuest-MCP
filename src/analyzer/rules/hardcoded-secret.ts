import { createHash } from 'node:crypto';
import path from 'node:path';
import type { Severity } from '../../types.js';
import { LOCK_FILES } from './no-lockfile.js';
import { matchContent } from './text.js';
import type { Rule, RuleHit } from './types.js';

interface SecretPattern {
  /** First part of the key; stage 7 picks the quest template by it. */
  type: string;
  label: string;
  pattern: RegExp;
  severity: Severity;
  /** Capture group holding the secret value; 0 = the whole match. */
  group: number;
}

const SPECIFIC: readonly SecretPattern[] = [
  { type: 'aws', label: 'AWS access key', pattern: /AKIA[0-9A-Z]{16}/g, severity: 'critical', group: 0 },
  { type: 'stripe', label: 'Stripe live key', pattern: /sk_live_[0-9a-zA-Z]{16,}/g, severity: 'critical', group: 0 },
  { type: 'stripe-test', label: 'Stripe test key', pattern: /sk_test_[0-9a-zA-Z]{16,}/g, severity: 'high', group: 0 },
  {
    type: 'telegram',
    label: 'Telegram bot token',
    pattern: /\b\d{8,10}:[A-Za-z0-9_-]{35}\b/g,
    severity: 'critical',
    group: 0,
  },
  { type: 'github', label: 'GitHub token', pattern: /\bghp_[A-Za-z0-9]{36}\b/g, severity: 'critical', group: 0 },
  {
    type: 'private-key',
    label: 'private key',
    pattern: /-----BEGIN [A-Z ]{0,30}PRIVATE KEY-----/g,
    severity: 'critical',
    group: 0,
  },
];

const ASSIGNMENT: SecretPattern = {
  type: 'assignment',
  label: 'secret value',
  // Name may carry a prefix/suffix (DB_PASSWORD, client_secret, apiKey) and quotes ("password": "...").
  pattern: /(?<![\w-])(['"]?)[\w-]{0,40}(?:password|secret|api[_-]?key)[\w-]{0,40}\1\s*[:=]\s*['"]([^'"\s]{16,})['"]/gi,
  severity: 'high',
  group: 2,
};

// .env* belongs to generic/env-tracked; lock files are full of integrity hashes.
const SKIPPED_FILES: ReadonlySet<string> = new Set([...LOCK_FILES, 'poetry.lock', 'uv.lock', 'Pipfile.lock']);

const TAIL = 4;

/** Shows at most ~40% of the value: a known prefix (up to 8 chars) plus the last 4; assignments show only the last 4. */
function mask(value: string, secret: SecretPattern): string {
  const budget = Math.ceil(value.length * 0.4);
  const head = secret === ASSIGNMENT ? 0 : Math.max(0, Math.min(8, budget - TAIL));
  return `${value.slice(0, head)}…${value.slice(-TAIL)}`;
}

function toHit(file: string, line: number, secret: SecretPattern, value: string): RuleHit {
  // The value itself is never stored: the key holds its hash, the message a mask.
  const hash = createHash('sha256').update(value).digest('hex').slice(0, 16);
  return {
    file,
    line,
    message: `Hardcoded ${secret.label}: ${mask(value, secret)}`,
    key: `${secret.type}:${hash}`,
    severity: secret.severity,
  };
}

export const hardcodedSecretRule: Rule = {
  id: 'generic/hardcoded-secret',
  category: 'security',
  severity: 'high',
  run(ctx) {
    const hits: RuleHit[] = [];
    for (const file of ctx.files) {
      const base = path.posix.basename(file.path);
      if (file.content === null || base.startsWith('.env') || SKIPPED_FILES.has(base)) continue;
      const known = new Set<string>();
      for (const secret of SPECIFIC) {
        for (const { line, match } of matchContent(file, secret.pattern)) {
          const value = match[secret.group] ?? match[0];
          known.add(value);
          hits.push(toHit(file.path, line, secret, value));
        }
      }
      for (const { line, match } of matchContent(file, ASSIGNMENT.pattern)) {
        const value = match[ASSIGNMENT.group] ?? '';
        // `secret = 'sk_live_…'` is one finding of the specific type, not two.
        if (value === '' || known.has(value)) continue;
        hits.push(toHit(file.path, line, ASSIGNMENT, value));
      }
    }
    return hits;
  },
};
