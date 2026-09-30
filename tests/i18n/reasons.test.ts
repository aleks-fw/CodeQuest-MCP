import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { toFindings } from '../../src/analyzer/findings.js';
import { jsDebugLogRule } from '../../src/analyzer/rules/js-debug-log.js';
import { CATALOGS, renderText } from '../../src/i18n/index.js';
import type { TextRef } from '../../src/types.js';
import { runRuleRaw } from '../helpers/rule-context.js';

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? walk(path.join(dir, entry.name))
      : entry.name.endsWith('.ts')
        ? [path.join(dir, entry.name)]
        : [],
  );

describe('reasons and finding messages', () => {
  it('every key used by a rule or a check exists in both catalogs', () => {
    const used = new Set<string>();
    for (const file of [...walk('src/analyzer/rules'), 'src/verification/criteria.ts', 'src/engine/cycle.ts']) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/\bsay\(\s*'([\w.-]+)'/g)) used.add(match[1] ?? '');
      for (const match of source.matchAll(/\bwhy\(\s*'([\w.-]+)'/g)) used.add(`why.${match[1]}`);
      for (const match of source.matchAll(/key: '(finding\.[\w.-]+)'/g)) used.add(match[1] ?? '');
    }
    expect(used.size).toBeGreaterThan(40);
    for (const key of used) {
      expect(CATALOGS.en[key], `en ${key}`).toBeTypeOf('string');
      expect(CATALOGS.ru[key], `ru ${key}`).toBeTypeOf('string');
    }
  });

  it('a finding keeps its English message and renders in Russian from its reference', () => {
    const hits = runRuleRaw(jsDebugLogRule, { 'src/server.ts': 'console.log("x");\n' });
    const [finding] = toFindings(jsDebugLogRule, hits);
    expect(finding?.message).toBe('console.log left in code');
    expect(renderText('ru', finding?.text, finding?.message)).toBe('В коде остался console.log');
    expect(renderText('en', finding?.text, finding?.message)).toBe('console.log left in code');
  });

  it('a stored text without a reference falls back to the English message', () => {
    expect(renderText('ru', undefined, 'Old text')).toBe('Old text');
  });

  it('joined reasons render part by part', () => {
    const text: TextRef = {
      key: 'why.joined',
      vars: {},
      parts: [
        { key: 'why.reg-cases', vars: { from: 5, to: 3 } },
        { key: 'why.reg-failing', vars: {} },
      ],
    };
    expect(renderText('en', text)).toBe('test cases dropped from 5 to 3; tests are failing');
    expect(renderText('ru', text)).toBe('тест-кейсов стало меньше: было 5, стало 3; тесты падают');
  });

  it('every kind of secret has its own message in both languages', () => {
    const source = readFileSync('src/analyzer/rules/hardcoded-secret.ts', 'utf8');
    const types = [...source.matchAll(/type: '([\w-]+)'/g)].map((match) => match[1]);
    expect(types.length).toBeGreaterThanOrEqual(7);
    for (const type of types) {
      expect(CATALOGS.en[`finding.hardcoded-secret.${type}`], `en ${type}`).toContain('{mask}');
      expect(CATALOGS.ru[`finding.hardcoded-secret.${type}`], `ru ${type}`).toContain('{mask}');
    }
  });

  it('a reference to a key no catalog has (saved by an older version) shows the stored English text, not the key', () => {
    expect(renderText('ru', { key: 'finding.gone-long-ago', vars: {} }, 'Old message')).toBe('Old message');
  });
});
