import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { errorText } from '../errors.js';
import type { Lang } from '../i18n/index.js';

/** Turns any failure into a tool result in the user's language, so one bad call never takes the server down. */
export function toolError(error: unknown, lang: Lang = 'en'): CallToolResult {
  return { isError: true, content: [{ type: 'text', text: errorText(error, lang) }] };
}
