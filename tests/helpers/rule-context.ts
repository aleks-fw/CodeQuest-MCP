import { buildContext } from '../../src/analyzer/analyze.js';
import type { Rule, RuleHit } from '../../src/analyzer/rules/types.js';
import { sourceFiles } from './source-files.js';

/** Runs one rule over in-memory files; `git` makes the context a repository with the given tracked paths. */
export function runRuleRaw(rule: Rule, files: Record<string, string>, git?: { tracked: string[] }): RuleHit[] {
  const context = buildContext({
    root: '',
    files: sourceFiles(files),
    isGitRepo: git !== undefined,
    tracked: new Set(git?.tracked ?? []),
  });
  return rule.run(context);
}

export function runRule(rule: Rule, files: Record<string, string>, git?: { tracked: string[] }): RuleHit[] {
  // The language reference (`text`) has its own tests; the rule tests compare the English message.
  return runRuleRaw(rule, files, git).map(({ text: _text, ...hit }) => hit);
}
