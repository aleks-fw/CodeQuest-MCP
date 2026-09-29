import type { SourceFile } from '../files.js';
import type { Rule, RuleHit } from './types.js';

const ADMIN_COMMAND =
  /^(?:admin\w*|ban|unban|kick|mute|unmute|broadcast|stats|promote|demote|restrict|purge|shutdown|announce|say)$/i;
// Case-sensitive on purpose: the command name itself ("admin") must not count as a check.
const PERMISSION_CHECK =
  /\bADMIN\w*|\bOWNER\w*|\bis_?[aA]dmin\b|\bIs[aA]dmin\w*|\bAdminFilter\b|\bis_?[oO]wner\b|\bfrom\??\.id\b|\bfrom_user\??\.id\b|\bget_?[cC]hat_?[mM]ember\b|\bget_?[cC]hat_?[aA]dministrators\b/;

// A registration line of a JS handler; the region of a handler ends where the next registration starts.
const JS_REGISTRATION = /^[ \t]*\w+\.(?:command|hears|action|on|start|help|onText|use|catch)\s*\(/gm;
const JS_COMMAND = /\b\w+\.command\(\s*(\[[^\]]*\]|['"`][^'"`]*['"`])/g;
const PY_DECORATOR = /^[ \t]*@\w+\.(?:message|edited_message|on_message|on)\s*\(.*$/gm;
const PY_COMMAND =
  /\bCommand\(\s*['"](\w+)['"]|\bcommands?\s*=\s*\[?\s*['"](\w+)['"]|\bfilters\.command\(\s*\[?\s*['"](\w+)['"]/;
const PY_BLOCK_END = /^(?:@|(?:async\s+)?def\s|class\s|if\s+__name__)/gm;
const PTB_COMMAND = /\bCommandHandler\(\s*['"](\w+)['"]\s*,\s*(\w+)/g;

export const botAdminNoCheckRule: Rule = {
  id: 'bot/admin-no-check',
  category: 'security',
  severity: 'high',
  pack: 'bot',
  run(ctx) {
    const hits: RuleHit[] = [];
    for (const file of ctx.files) {
      if (file.kind !== 'code' || file.content === null) continue;
      const regions =
        file.language === 'python'
          ? pythonRegions(file.content)
          : file.language === 'typescript' || file.language === 'javascript'
            ? jsRegions(file.content)
            : [];
      const reported = new Set<string>();
      for (const { command, region } of regions) {
        if (!ADMIN_COMMAND.test(command) || PERMISSION_CHECK.test(region) || reported.has(command)) continue;
        reported.add(command);
        hits.push(hit(file, command));
      }
    }
    return hits;
  },
};

interface Region {
  command: string;
  region: string;
}

function hit(file: SourceFile, command: string): RuleHit {
  return {
    file: file.path,
    message: `/${command} is an admin command without a permission check; any user can run it`,
    key: command.toLowerCase(),
  };
}

function jsRegions(content: string): Region[] {
  const starts = [...content.matchAll(JS_REGISTRATION)].map((match) => match.index);
  const regions: Region[] = [];
  for (const match of content.matchAll(JS_COMMAND)) {
    const end = starts.find((start) => start > match.index) ?? content.length;
    const region = content.slice(match.index, end);
    for (const name of (match[1] ?? '').matchAll(/['"`](\w+)['"`]/g)) regions.push({ command: name[1] ?? '', region });
  }
  return regions;
}

function pythonRegions(content: string): Region[] {
  const regions: Region[] = [];
  for (const decorator of content.matchAll(PY_DECORATOR)) {
    const found = PY_COMMAND.exec(decorator[0]);
    const command = found?.[1] ?? found?.[2] ?? found?.[3];
    if (command !== undefined)
      regions.push({ command, region: content.slice(decorator.index, blockEnd(content, decorator.index)) });
  }
  for (const handler of content.matchAll(PTB_COMMAND)) {
    const name = handler[2] ?? '';
    const def = new RegExp(`^(?:async\\s+)?def\\s+${name}\\b`, 'm').exec(content);
    if (def)
      regions.push({ command: handler[1] ?? '', region: content.slice(def.index, blockEnd(content, def.index)) });
  }
  return regions;
}

/** End of the function that starts at or after `from`: the next top-level decorator, def, class or main guard. */
function blockEnd(content: string, from: number): number {
  const def = /^(?:async\s+)?def\s.*$/gm;
  def.lastIndex = from;
  const header = def.exec(content);
  if (!header) return content.length;
  PY_BLOCK_END.lastIndex = header.index + header[0].length;
  return PY_BLOCK_END.exec(content)?.index ?? content.length;
}
