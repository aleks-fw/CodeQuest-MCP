import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { hardcodedSecretRule } from '../../src/analyzer/rules/hardcoded-secret.js';
import { FAKE_SECRETS } from '../helpers/fixtures.js';
import { runRule } from '../helpers/rule-context.js';

const hashOf = (value: string): string => createHash('sha256').update(value).digest('hex').slice(0, 16);
// Built at runtime so this test file itself does not contain a password-looking assignment.
const PASSWORD = ['correct', 'horse', 'battery', 'staple'].join('-');

describe('generic/hardcoded-secret', () => {
  it.each([
    ['aws', 'critical', `const key = '${FAKE_SECRETS.AWS}';`, FAKE_SECRETS.AWS],
    ['stripe', 'critical', `const key = '${FAKE_SECRETS.STRIPE_LIVE}';`, FAKE_SECRETS.STRIPE_LIVE],
    ['stripe-test', 'high', `const key = '${FAKE_SECRETS.STRIPE_TEST}';`, FAKE_SECRETS.STRIPE_TEST],
    ['telegram', 'critical', `const token = '${FAKE_SECRETS.TELEGRAM}';`, FAKE_SECRETS.TELEGRAM],
    ['github', 'critical', `const token = '${FAKE_SECRETS.GITHUB}';`, FAKE_SECRETS.GITHUB],
    ['private-key', 'critical', `const pem = '${FAKE_SECRETS.PRIVATE_KEY}';`, FAKE_SECRETS.PRIVATE_KEY],
    ['assignment', 'high', `const password = '${PASSWORD}';`, PASSWORD],
  ])('finds a %s secret with severity %s', (type, severity, line, value) => {
    const hits = runRule(hardcodedSecretRule, { 'src/config.ts': `// settings\n${line}\n` });
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ file: 'src/config.ts', line: 2, severity, key: `${type}:${hashOf(value)}` });
  });

  it('masks the value in the message and never keeps it whole', () => {
    const value = FAKE_SECRETS.STRIPE_LIVE;
    const [hit] = runRule(hardcodedSecretRule, { 'src/pay.ts': `export const key = '${value}';\n` });
    expect(hit?.message).toBe(`Hardcoded Stripe live key: ${value.slice(0, 8)}…${value.slice(-4)}`);
    expect(JSON.stringify(hit)).not.toContain(value);
  });

  it('reports a known key inside a secret assignment once, as the specific type', () => {
    const hits = runRule(hardcodedSecretRule, { 'src/pay.ts': `const sec${'ret'} = '${FAKE_SECRETS.STRIPE_LIVE}';\n` });
    expect(hits.map((hit) => hit.key)).toEqual([`stripe:${hashOf(FAKE_SECRETS.STRIPE_LIVE)}`]);
  });

  it('skips .env files and lock files', () => {
    const token = FAKE_SECRETS.TELEGRAM;
    const hits = runRule(hardcodedSecretRule, {
      '.env': `BOT_TOKEN=${token}\n`,
      'apps/bot/.env.local': `BOT_TOKEN=${token}\n`,
      'package-lock.json': `{ "token": "${token}" }\n`,
      'yarn.lock': `token "${token}"\n`,
    });
    expect(hits).toEqual([]);
  });

  it('finds a Telegram token whose last character is a dash', () => {
    const token = ['123456789', `AAH${'x'.repeat(31)}-`].join(':');
    const hits = runRule(hardcodedSecretRule, { 'src/bot.ts': `const token = '${token}';\n` });
    expect(hits.map((hit) => hit.key)).toEqual([`telegram:${hashOf(token)}`]);
  });
  it('still scans .env.example, which env-tracked does not cover', () => {
    const hits = runRule(hardcodedSecretRule, { '.env.example': `BOT_TOKEN=${FAKE_SECRETS.TELEGRAM}\n` });
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ file: '.env.example', key: `telegram:${hashOf(FAKE_SECRETS.TELEGRAM)}` });
  });
  it('shows only the last 4 chars of an assignment value', () => {
    const value = 'abcdefgh12345678';
    const [hit] = runRule(hardcodedSecretRule, { 'src/a.ts': `const password = '${value}';\n` });
    expect(hit?.message).toBe('Hardcoded secret value: …5678');
    expect(hit?.message).not.toContain(value.slice(0, 8));
  });

  it('never shows more than about 40% of a short known key', () => {
    const aws = FAKE_SECRETS.AWS;
    const [hit] = runRule(hardcodedSecretRule, { 'a.ts': `const k = '${aws}';\n` });
    expect(hit?.message).toBe(`Hardcoded AWS access key: ${aws.slice(0, 4)}…${aws.slice(-4)}`);
  });

  it.each([
    ['DB_PASSWORD', `DB_PASSWORD = '${PASSWORD}'`],
    ['JWT_SECRET', `const JWT_SECRET = "${PASSWORD}";`],
    ['json password', `{ "password": "${PASSWORD}" }`],
    ['apiKey', `const config = { apiKey: '${PASSWORD}' };`],
    ['client_secret', `client_secret: "${PASSWORD}"`],
  ])('finds an assignment named %s', (_name, line) => {
    const hits = runRule(hardcodedSecretRule, { 'src/c.ts': `${line}\n` });
    expect(hits.map((hit) => hit.key)).toEqual([`assignment:${hashOf(PASSWORD)}`]);
  });

  it('ignores calls, short values and env reads', () => {
    const hits = runRule(hardcodedSecretRule, {
      'a.ts': "const password = getPassword();\nconst secret = 'short';\nconst apiKey = process.env.API_KEY;\n",
    });
    expect(hits).toEqual([]);
  });

  it('finds SECRET_KEY and a name with a prefix and suffix', () => {
    const hits = runRule(hardcodedSecretRule, {
      'a.py': `SECRET_KEY = "${PASSWORD}"\nmy_api-key_v2 = '${PASSWORD}'\n`,
    });
    expect(hits.map((hit) => hit.line)).toEqual([1, 2]);
  });

  it.each([
    ['a', 'a'],
    ['a-', 'a-'],
    ['begin', '-----BEGIN A'],
    ['digits', '1234567890'],
  ])('scans a long run of %s quickly', (_name, unit) => {
    const text = unit.repeat(Math.ceil(200_000 / unit.length));
    const started = performance.now();
    const hits = runRule(hardcodedSecretRule, { 'big.txt': text });
    expect(hits).toEqual([]);
    expect(performance.now() - started).toBeLessThan(500);
  });

  it('gives the same value the same key in different files', () => {
    const hits = runRule(hardcodedSecretRule, {
      'a.ts': `const k = '${FAKE_SECRETS.AWS}';\n`,
      'b.py': `K = "${FAKE_SECRETS.AWS}"\n`,
    });
    const key = `aws:${hashOf(FAKE_SECRETS.AWS)}`;
    expect(hits.map((hit) => [hit.file, hit.key])).toEqual([
      ['a.ts', key],
      ['b.py', key],
    ]);
  });
});
