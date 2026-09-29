import { todoRule } from './todo.js';
import type { Rule } from './types.js';

/** Rules run in this order; each task appends its rules. */
export const RULES: readonly Rule[] = [todoRule];
