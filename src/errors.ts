/** An error whose message is safe and useful to show to the user as is. */
export class CodeQuestError extends Error {
  override name = 'CodeQuestError';
}
