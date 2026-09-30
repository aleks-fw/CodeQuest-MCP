import path from 'node:path';
import type { Criterion, Facts, Finding, Quest } from '../../types.js';

export type Pack = 'generic' | 'shop' | 'bot';
export type CommandName = 'test' | 'lint' | 'build';

/** Findings of one quest: one template, usually one file, several when low/medium findings are batched (spec §7.2). */
export interface Group {
  findings: Finding[];
  /** Sorted, unique. */
  files: string[];
}

export interface CriteriaContext {
  facts: Facts;
  /** Commands the project defines and the user allowed to run; starred conditions of spec §7.1 depend on it. */
  commands: Partial<Record<CommandName, string>>;
}

export interface Template {
  id: string;
  pack: Pack;
  rules: readonly string[];
  /** Extra condition on a finding (a path, a key) for templates that share a rule. */
  when?: (finding: Finding) => boolean;
  category: Quest['category'];
  criteria: (group: Group, context: CriteriaContext) => Criterion[];
}

const criterion = (type: Criterion['type'], params: Record<string, unknown> = {}): Criterion => ({ type, params });

const resolved = (): Criterion => criterion('finding_resolved');
const noRegressions = (): Criterion => criterion('no_regressions');
const exists = (group: Group): Criterion => criterion('target_exists', { files: group.files });
/** A starred condition: present only when the command is defined and allowed. */
const commands = (context: CriteriaContext, ...names: CommandName[]): Criterion[] =>
  names
    .filter((name) => context.commands[name] !== undefined)
    .map((name) => criterion('command_passes', { command: name }));

const base = (file: string): string => path.posix.basename(file);
const first = (group: Group): string => group.files[0] ?? '';
const ruleOf = (finding: Finding): string => finding.rule;
const inPath = (pattern: RegExp) => (finding: Finding) => pattern.test(finding.file ?? '');
const baseMatches = (pattern: RegExp) => (finding: Finding) => pattern.test(base(finding.file ?? ''));

const testCriteria = (group: Group, context: CriteriaContext): Criterion[] => [
  criterion('tests_cover', { module: first(group) }),
  exists(group),
  ...commands(context, 'test'),
  noRegressions(),
];

const SIGNATURE_PATTERN =
  'constructEvent|construct_event|verify_?[sS]ignature|createHmac|timingSafeEqual|hmac\\.(?:new|compare_digest)';
const ERROR_HANDLER_PATTERN = 'bot\\.catch\\s*\\(|polling_error|\\.errors?\\b|add_error_handler\\s*\\(';

/**
 * Every template of spec §7.1, most specific first: a finding goes to the first template that takes its rule and passes
 * `when`, so each finding lands in exactly one quest.
 */
export const TEMPLATES: readonly Template[] = [
  // Shop pack.
  {
    id: 'protect-cart',
    pack: 'shop',
    rules: ['generic/untested-module'],
    when: inPath(/cart|basket/i),
    category: 'testing',
    criteria: testCriteria,
  },
  {
    id: 'payment-guardian',
    pack: 'shop',
    rules: ['generic/untested-module'],
    when: inPath(/payment|checkout|order/i),
    category: 'testing',
    criteria: testCriteria,
  },
  {
    id: 'validate-payment-webhooks',
    pack: 'shop',
    rules: ['shop/webhook-no-signature'],
    category: 'security',
    criteria: (group) => [
      resolved(),
      criterion('pattern_present', { files: group.files, pattern: SIGNATURE_PATTERN }),
      exists(group),
      noRegressions(),
    ],
  },
  {
    id: 'clean-inventory',
    pack: 'shop',
    rules: ['generic/unused-file'],
    when: (finding) =>
      /(?:^|\/)components\//.test(finding.file ?? '') && /product|item|catalog/i.test(finding.file ?? ''),
    category: 'cleanup',
    criteria: (group, context) => [
      resolved(),
      criterion('pattern_absent', { files: group.files }),
      ...commands(context, 'build'),
      noRegressions(),
    ],
  },
  // Telegram bot pack.
  {
    id: 'handle-api-errors',
    pack: 'bot',
    rules: ['bot/no-error-handler'],
    category: 'reliability',
    criteria: () => [resolved(), criterion('pattern_present', { pattern: ERROR_HANDLER_PATTERN }), noRegressions()],
  },
  {
    id: 'guard-admin-commands',
    pack: 'bot',
    rules: ['bot/admin-no-check'],
    category: 'security',
    criteria: (group) => [
      resolved(),
      criterion('target_exists', {
        files: group.files,
        commands: group.findings.map((finding) => finding.key.replace(/#\d+$/, '')),
      }),
      noRegressions(),
    ],
  },
  {
    id: 'test-message-parsing',
    pack: 'bot',
    rules: ['generic/untested-module'],
    when: baseMatches(/parse|extract|format|command/i),
    category: 'testing',
    criteria: testCriteria,
  },
  {
    id: 'improve-command-routing',
    pack: 'bot',
    rules: ['bot/fat-router'],
    category: 'architecture',
    criteria: (_group, context) => [
      resolved(),
      criterion('target_exists', { minBotHandlers: context.facts.botHandlers }),
      noRegressions(),
    ],
  },
  {
    id: 'add-retry-logic',
    pack: 'bot',
    rules: ['bot/no-timeout'],
    category: 'reliability',
    criteria: (group) => [resolved(), exists(group), noRegressions()],
  },
  {
    id: 'protect-the-token',
    pack: 'bot',
    rules: ['generic/hardcoded-secret'],
    when: (finding) => finding.key.startsWith('telegram:'),
    category: 'security',
    criteria: (group) => [
      resolved(),
      criterion('pattern_absent', { secretKeys: group.findings.map((finding) => finding.key.replace(/#\d+$/, '')) }),
      noRegressions(),
    ],
  },
  // Generic pack.
  {
    id: 'clean-up-todos',
    pack: 'generic',
    rules: ['generic/todo'],
    category: 'cleanup',
    criteria: () => [resolved(), noRegressions()],
  },
  {
    id: 'remove-dead-code',
    pack: 'generic',
    rules: ['generic/unused-file'],
    category: 'cleanup',
    criteria: (group, context) => [
      resolved(),
      criterion('pattern_absent', { files: group.files }),
      ...commands(context, 'build'),
      noRegressions(),
    ],
  },
  {
    id: 'split-large-file',
    pack: 'generic',
    rules: ['generic/large-file'],
    category: 'architecture',
    criteria: (group, context) => [
      resolved(),
      criterion('target_exists', { files: group.files, movedLinesShare: 0.5 }),
      ...commands(context, 'build', 'test'),
      noRegressions(),
    ],
  },
  {
    id: 'break-import-cycle',
    pack: 'generic',
    rules: ['generic/import-cycle'],
    category: 'architecture',
    criteria: (group, context) => [
      resolved(),
      criterion('target_exists', {
        files: [...new Set(group.findings.flatMap((finding) => finding.key.replace(/#\d+$/, '').split('|')))].sort(),
      }),
      ...commands(context, 'build'),
      noRegressions(),
    ],
  },
  {
    id: 'remove-hardcoded-secret',
    pack: 'generic',
    rules: ['generic/hardcoded-secret'],
    category: 'security',
    criteria: (group) => [
      resolved(),
      criterion('pattern_absent', { secretKeys: group.findings.map((finding) => finding.key.replace(/#\d+$/, '')) }),
      noRegressions(),
    ],
  },
  {
    id: 'deduplicate-code',
    pack: 'generic',
    rules: ['generic/duplicate-block'],
    category: 'refactoring',
    criteria: (group, context) => [resolved(), exists(group), ...commands(context, 'build', 'test'), noRegressions()],
  },
  {
    id: 'add-test-command',
    pack: 'generic',
    rules: ['generic/no-test-command'],
    category: 'testing',
    criteria: (_group, context) => [resolved(), ...commands(context, 'test')],
  },
  {
    id: 'write-first-tests',
    pack: 'generic',
    rules: ['generic/no-tests'],
    category: 'testing',
    criteria: (_group, context) => [
      criterion('finding_resolved', { minCases: 3 }),
      ...commands(context, 'test'),
      noRegressions(),
    ],
  },
  {
    id: 'add-tests-for-module',
    pack: 'generic',
    rules: ['generic/untested-module'],
    category: 'testing',
    criteria: testCriteria,
  },
  {
    id: 'fix-failing-tests',
    pack: 'generic',
    rules: ['generic/failing-tests'],
    category: 'bug',
    // The test command is required here, not starred: the quest is about it.
    criteria: () => [criterion('command_passes', { command: 'test' }), noRegressions()],
  },
  {
    id: 'write-readme',
    pack: 'generic',
    rules: ['generic/no-readme'],
    category: 'documentation',
    criteria: () => [resolved()],
  },
  {
    id: 'document-environment',
    pack: 'generic',
    rules: ['generic/no-env-example'],
    category: 'documentation',
    criteria: () => [resolved()],
  },
  {
    id: 'lock-dependencies',
    pack: 'generic',
    rules: ['generic/no-lockfile'],
    category: 'dependencies',
    criteria: () => [resolved()],
  },
  {
    id: 'protect-env',
    pack: 'generic',
    rules: ['generic/env-tracked'],
    category: 'security',
    criteria: () => [resolved(), noRegressions()],
  },
  {
    id: 'remove-suppressions',
    pack: 'generic',
    rules: ['generic/suppression'],
    category: 'cleanup',
    criteria: (_group, context) => [resolved(), ...commands(context, 'lint'), noRegressions()],
  },
  {
    id: 'revive-skipped-tests',
    pack: 'generic',
    rules: ['generic/skipped-test'],
    category: 'testing',
    criteria: (_group, context) => [resolved(), ...commands(context, 'test'), noRegressions()],
  },
  {
    id: 'handle-errors-in-file',
    pack: 'generic',
    rules: ['generic/empty-catch', 'py/bare-except'],
    category: 'reliability',
    criteria: () => [resolved(), noRegressions()],
  },
  {
    id: 'sanitize-html',
    pack: 'generic',
    rules: ['js/dangerous-html'],
    category: 'security',
    criteria: (group) => [resolved(), exists(group), noRegressions()],
  },
  {
    id: 'remove-eval',
    pack: 'generic',
    rules: ['js/eval', 'py/eval'],
    category: 'security',
    criteria: (group) => [resolved(), exists(group), noRegressions()],
  },
  {
    id: 'async-file-access',
    pack: 'generic',
    rules: ['js/sync-fs-in-handler'],
    category: 'performance',
    criteria: (group) => [resolved(), exists(group), noRegressions()],
  },
  {
    id: 'optimize-images',
    pack: 'generic',
    rules: ['js/raw-img'],
    category: 'performance',
    criteria: () => [resolved(), noRegressions()],
  },
  {
    id: 'remove-debug-logs',
    pack: 'generic',
    rules: ['js/debug-log'],
    category: 'cleanup',
    criteria: (_group, context) => [resolved(), ...commands(context, 'lint'), noRegressions()],
  },
  {
    id: 'fix-mutable-defaults',
    pack: 'generic',
    rules: ['py/mutable-default'],
    category: 'bug',
    criteria: () => [resolved(), noRegressions()],
  },
  {
    id: 'unblock-the-event-loop',
    pack: 'generic',
    rules: ['py/blocking-in-async'],
    category: 'performance',
    criteria: (group) => [resolved(), exists(group), noRegressions()],
  },
];

/** The template a finding belongs to; packs that are off are skipped. */
export function templateFor(finding: Finding, packs: ReadonlySet<string>): Template | undefined {
  return TEMPLATES.find(
    (template) =>
      packs.has(template.pack) && template.rules.includes(ruleOf(finding)) && (template.when?.(finding) ?? true),
  );
}
