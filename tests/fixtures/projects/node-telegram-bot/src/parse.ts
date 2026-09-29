export interface ParsedCommand {
  command: string | null;
  args: string[];
}

export function parseCommand(text: string): ParsedCommand {
  const trimmed = text.trim();
  if (!trimmed.startsWith('/')) {
    return { command: null, args: trimmed ? trimmed.split(/\s+/) : [] };
  }
  const [head = '', ...args] = trimmed.split(/\s+/);
  const command = head.slice(1).split('@')[0] ?? '';
  return { command: command || null, args };
}
