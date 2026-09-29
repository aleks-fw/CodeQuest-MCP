import { emptyCatchRule } from './empty-catch.js';
import { jsDebugLogRule } from './js-debug-log.js';
import { jsEvalRule } from './js-eval.js';
import { largeFileRule } from './large-file.js';
import { skippedTestRule } from './skipped-test.js';
import { suppressionRule } from './suppression.js';
import { todoRule } from './todo.js';
import type { Rule } from './types.js';

/** Rules run in this order; each task appends its rules. */
export const RULES: readonly Rule[] = [
  todoRule,
  suppressionRule,
  skippedTestRule,
  emptyCatchRule,
  largeFileRule,
  jsEvalRule,
  jsDebugLogRule,
];
