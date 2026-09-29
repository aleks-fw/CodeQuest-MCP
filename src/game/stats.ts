import type { Finding, Snapshot, Stats } from '../types.js';

/** What the last test run said. Only the engine knows it; the formulas just read it. */
export interface TestRunResult {
  passed: boolean;
  /** Failed test count from the summary line; 1 when the line could not be parsed. */
  failedTests: number;
}

export interface StatsInput {
  snapshot: Pick<Snapshot, 'facts' | 'findings'>;
  /** False until the user allowed running project commands: Testing then ignores the test run. */
  commandsAllowed: boolean;
  lastTestRun?: TestRunResult | null;
}

/** Weight of one open finding (spec §4). */
export const SEVERITY_WEIGHTS = { critical: 10, high: 5, medium: 2, low: 1 } as const;

/** Finding category → the 0..100 stat it lowers. `testing` and `bug` are handled by their own formulas. */
const HEALTH_STATS = {
  architecture: 'architecture',
  security: 'security',
  performance: 'performance',
  'clean-code': 'cleanCode',
  reliability: 'reliability',
  maintainability: 'maintainability',
} as const satisfies Record<string, keyof Stats>;

const TECH_DEBT_RULES: ReadonlySet<string> = new Set([
  'generic/todo',
  'generic/duplicate-block',
  'generic/unused-file',
  'generic/large-file',
  'generic/suppression',
]);

const FAILING_TESTS_RULE = 'generic/failing-tests';

export function computeStats(input: StatsInput): Stats {
  const { snapshot } = input;
  const weights = new Map<keyof Stats, number>();
  let bugs = 0;
  let techDebt = 0;
  for (const finding of snapshot.findings) {
    const stat = healthStatOf(finding);
    if (stat !== null) weights.set(stat, (weights.get(stat) ?? 0) + SEVERITY_WEIGHTS[finding.severity]);
    // The failing-tests finding is the same failure as the failed-test count below; it must not count twice.
    if (finding.category === 'bug' && finding.rule !== FAILING_TESTS_RULE) bugs++;
    if (TECH_DEBT_RULES.has(finding.rule)) techDebt++;
  }
  const scale = 1 + Math.sqrt(snapshot.facts.sourceFiles / 10);
  const health = (stat: keyof Stats): number => healthScore(weights.get(stat) ?? 0, scale);
  const failedTests = input.commandsAllowed && input.lastTestRun ? input.lastTestRun.failedTests : 0;
  return {
    architecture: health('architecture'),
    testing: testingScore(input),
    security: health('security'),
    performance: health('performance'),
    cleanCode: health('cleanCode'),
    reliability: health('reliability'),
    maintainability: health('maintainability'),
    bugs: bugs + failedTests,
    techDebt,
  };
}

/** 100 × e^(−W / (8 × S)), rounded; no findings give 100. */
export function healthScore(weight: number, scale: number): number {
  return Math.round(100 * Math.exp(-weight / (8 * scale)));
}

function healthStatOf(finding: Finding): keyof Stats | null {
  return Object.hasOwn(HEALTH_STATS, finding.category)
    ? HEALTH_STATS[finding.category as keyof typeof HEALTH_STATS]
    : null;
}

function testingScore(input: StatsInput): number {
  const { facts } = input.snapshot;
  if (facts.modules === 0) return 100;
  // A coverage report beats the "module has a test" share when there is one.
  const share = facts.coverage ?? facts.modulesWithTests / facts.modules;
  const covered = Math.min(1, Math.max(0, share));
  const hasCommand = facts.commands.test !== undefined ? 1 : 0;
  if (!input.commandsAllowed) return clamp(Math.round(((60 * covered + 20 * hasCommand) / 80) * 100));
  const green = input.lastTestRun?.passed ? 1 : 0;
  return clamp(Math.round(60 * covered + 20 * hasCommand + 20 * green));
}

function clamp(value: number): number {
  return Math.min(100, Math.max(0, value));
}
