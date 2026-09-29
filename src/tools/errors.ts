import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { CodeQuestError } from '../errors.js';

/** Turns any failure into a tool result, so one bad call never takes the server down. */
export function toolError(error: unknown): CallToolResult {
  const message =
    error instanceof CodeQuestError
      ? error.message
      : `Unexpected error: ${error instanceof Error ? error.message : String(error)}`;
  return { isError: true, content: [{ type: 'text', text: message }] };
}
