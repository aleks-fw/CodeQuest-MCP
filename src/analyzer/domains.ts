import type { Facts } from '../types.js';
import type { SourceFile } from './files.js';

/** Minimum confidence for a pack to be on (spec §3.4). */
export const PACK_THRESHOLD = 0.5;

type Domain = Facts['domains'][number];

const PAYMENT_DEPENDENCY = /^(?:stripe|@stripe\/.+|@paypal\/.+|paypal.*|paypalrestsdk|@shopify\/.+|@medusajs\/.+)$/;
const BOT_DEPENDENCIES: ReadonlySet<string> = new Set([
  'telegraf',
  'grammy',
  'node-telegram-bot-api',
  'aiogram',
  'python-telegram-bot',
  'telethon',
  'pyrogram',
]);
const SHOP_PATH_GROUPS: readonly (readonly [string, RegExp])[] = [
  ['cart', /cart|basket/i],
  ['checkout', /checkout|order/i],
  ['catalog', /product|catalog/i],
  ['payment', /payment|webhook/i],
];

export interface DomainInput {
  files: SourceFile[];
  /** Dependencies of package.json and Python requirements together. */
  dependencies: readonly string[];
  botHandlers: number;
}

/** The generic pack is always on; shop and bot come with a confidence and the evidence for it. */
export function detectDomains(input: DomainInput): Domain[] {
  const domains: Domain[] = [{ pack: 'generic', confidence: 1, evidence: [] }];
  const shop = shopDomain(input);
  if (shop.confidence >= PACK_THRESHOLD) domains.push(shop);
  const bot = botDomain(input);
  if (bot.confidence >= PACK_THRESHOLD) domains.push(bot);
  return domains;
}

function shopDomain(input: DomainInput): Domain {
  const evidence: string[] = [];
  let confidence = 0;
  const payment = input.dependencies.find((name) => PAYMENT_DEPENDENCY.test(name));
  if (payment !== undefined) {
    confidence += 0.5;
    evidence.push(`dependency ${payment}`);
  }
  const paths = input.files.filter((file) => file.kind === 'code').map((file) => file.path);
  for (const [group, pattern] of SHOP_PATH_GROUPS) {
    if (paths.some((filePath) => pattern.test(filePath))) {
      confidence += 0.15;
      evidence.push(`paths: ${group}`);
    }
  }
  return { pack: 'shop', confidence: round(Math.min(1, confidence)), evidence };
}

function botDomain(input: DomainInput): Domain {
  const framework = input.dependencies.find((name) => BOT_DEPENDENCIES.has(name));
  if (framework === undefined) return { pack: 'bot', confidence: 0, evidence: [] };
  const evidence = [`dependency ${framework}`];
  let confidence = 0.8;
  if (input.botHandlers > 0) {
    confidence += 0.2;
    evidence.push(`handlers: ${input.botHandlers}`);
  }
  return { pack: 'bot', confidence: round(Math.min(1, confidence)), evidence };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
