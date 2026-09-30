import type { Severity, TextRef } from '../../types.js';
import type { AnalysisContext } from '../context.js';

export type FindingCategory =
  | 'architecture'
  | 'security'
  | 'performance'
  | 'clean-code'
  | 'reliability'
  | 'maintainability'
  | 'testing'
  | 'bug';

export interface RuleHit {
  file?: string;
  line?: number;
  message: string;
  text?: TextRef;
  /** Meaning of the finding without a line number; part of Finding.id (spec §3.5). */
  key: string;
  /** Overrides Rule.severity for this hit. */
  severity?: Severity;
}

export interface Rule {
  id: string;
  category: FindingCategory;
  severity: Severity;
  /** Only runs when this pack is on for the project (spec §3.4); other rules always run. */
  pack?: 'shop' | 'bot';
  run(ctx: AnalysisContext): RuleHit[];
}
