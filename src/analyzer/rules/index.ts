import { emptyCatchRule } from './empty-catch.js';
import { envTrackedRule } from './env-tracked.js';
import { hardcodedSecretRule } from './hardcoded-secret.js';
import { importCycleRule } from './import-cycle.js';
import { jsDebugLogRule } from './js-debug-log.js';
import { jsEvalRule } from './js-eval.js';
import { largeFileRule } from './large-file.js';
import { noEnvExampleRule } from './no-env-example.js';
import { noLockfileRule } from './no-lockfile.js';
import { noReadmeRule } from './no-readme.js';
import { noTestCommandRule } from './no-test-command.js';
import { noTestsRule } from './no-tests.js';
import { skippedTestRule } from './skipped-test.js';
import { suppressionRule } from './suppression.js';
import { todoRule } from './todo.js';
import type { Rule } from './types.js';
import { untestedModuleRule } from './untested-module.js';
import { unusedFileRule } from './unused-file.js';

/** Rules run in this order; each task appends its rules. */
export const RULES: readonly Rule[] = [
  todoRule,
  suppressionRule,
  skippedTestRule,
  emptyCatchRule,
  largeFileRule,
  jsEvalRule,
  jsDebugLogRule,
  noReadmeRule,
  noEnvExampleRule,
  noLockfileRule,
  envTrackedRule,
  hardcodedSecretRule,
  noTestsRule,
  noTestCommandRule,
  untestedModuleRule,
  importCycleRule,
  unusedFileRule,
];
