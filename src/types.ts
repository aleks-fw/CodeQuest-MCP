// Data model shared by every module (spec §5). Add new fields here, not in modules.

export type Severity = 'low' | 'medium' | 'high' | 'critical';

export type QuestCategory =
  | 'bug'
  | 'testing'
  | 'architecture'
  | 'security'
  | 'performance'
  | 'refactoring'
  | 'cleanup'
  | 'dependencies'
  | 'documentation'
  | 'reliability'
  | 'maintainability';

/** A resolved project: stable id, folder name and absolute root path. */
export interface ProjectRef {
  id: string;
  name: string;
  root: string;
}

export interface Finding {
  id: string;
  rule: string;
  category: string;
  severity: Severity;
  file?: string;
  line?: number;
  message: string;
  key: string;
}

export interface Facts {
  languages: Record<string, number>;
  stacks: ('js' | 'python')[];
  frameworks: string[];
  domains: { pack: string; confidence: number; evidence: string[] }[];
  commands: { test?: string; lint?: string; build?: string };
  /** Text of the scripts behind the commands (package.json scripts; the command itself for Python): a changed one is noticed. */
  scripts: { test?: string; lint?: string; build?: string };
  sourceFiles: number;
  modules: number;
  modulesWithTests: number;
  coverage?: number;
  testCasesTotal: number;
  testCasesByModule: Record<string, number>;
  codeLines: number;
  fileLines: Record<string, number>;
  botHandlers: number;
  hotspots: string[];
}

export interface Snapshot {
  schema: 1;
  takenAt: string;
  changeKey: string;
  head: string | null;
  facts: Facts;
  findings: Finding[];
  errors: { rule: string; message: string }[];
}

export interface Criterion {
  type:
    | 'finding_resolved'
    | 'target_exists'
    | 'tests_cover'
    | 'pattern_present'
    | 'pattern_absent'
    | 'command_passes'
    | 'no_regressions';
  params: Record<string, unknown>;
}

export interface CriterionResult {
  type: Criterion['type'];
  ok: boolean;
  detail: string;
  /** The condition failed because a file of the quest is gone; with no findings left the quest is obsolete (spec §8.3). */
  missing?: boolean;
}

export interface Baseline {
  head: string | null;
  takenAt: string;
  findings: string[];
  highFindings: string[];
  testCasesTotal: number;
  testCasesByModule: Record<string, number>;
  codeLines: number;
  fileLines: Record<string, number>;
  botHandlers: number;
  scripts: { test?: string; lint?: string; build?: string };
}

export interface Quest {
  id: string;
  template: string;
  pack: string;
  title: string;
  description: string;
  /** Variables of the quest texts; the catalog key is derived from `template`. */
  vars?: Record<string, string | number>;
  category: QuestCategory;
  difficulty: 'easy' | 'medium' | 'hard' | 'epic';
  findings: string[];
  criteria: Criterion[];
  subtasks?: Quest[];
  status: 'open' | 'completed' | 'obsolete';
  createdAt: string;
  baseline: Baseline;
  /** When the user took the quest to work; only a marker, XP is paid after the check either way. */
  acceptedAt?: string;
  completedAt?: string;
  xpAwarded?: number;
  lastCheck?: CriterionResult[];
}

export interface Stats {
  architecture: number;
  testing: number;
  security: number;
  performance: number;
  cleanCode: number;
  reliability: number;
  maintainability: number;
  bugs: number;
  techDebt: number;
}

export interface CommandRun {
  ok: boolean;
  exitCode: number | null;
  failedTests?: number;
  durationMs: number;
  changeKey: string;
  at: string;
  tail: string;
}

export type EventType =
  | 'analysis'
  | 'quest_opened'
  | 'quest_accepted'
  | 'quest_completed'
  | 'epic_progress'
  | 'quest_obsolete'
  | 'verification_failed'
  | 'xp'
  | 'level_up'
  | 'finding_returned'
  | 'settings_changed';

/** One line of events.jsonl (spec §5): append-only, numbered from 1. */
export interface GameEvent {
  seq: number;
  at: string;
  type: EventType;
  data: Record<string, unknown>;
}

/** projects/<id>/project.json */
export interface ProjectRecord {
  schema: 1;
  path: string;
  name: string;
  firstCommit: string | null;
  allowCommands: boolean;
  commandTimeoutSec: number;
}

/** profile.json: the projects the user has, each with its own XP (there is no shared XP). */
export interface Profile {
  schema: 1;
  projects: { id: string; name: string; path: string; level: number; xp: number; updatedAt: string }[];
}

export interface ProjectState {
  schema: 1;
  xp: number;
  level: number;
  stats: Stats;
  quests: Quest[];
  paidFindings: string[];
  shownEventSeq: number;
  lastRuns: { test?: CommandRun; lint?: CommandRun; build?: CommandRun };
}
