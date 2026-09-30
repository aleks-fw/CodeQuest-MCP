import { say } from './say.js';
import type { Rule, RuleHit } from './types.js';

const WEBHOOK_PATH = /(?:^|\/)[^/]*webhook[^/]*(?:\/|\.)/i;
// Stripe SDK, generic helpers and a hand-written HMAC comparison all count as a signature check.
const SIGNATURE_CHECK =
  /\bconstructEvent(?:Async)?\s*\(|\bconstruct_event\s*\(|\bverify_?[sS]ignature\s*\(|\bcreateHmac\s*\(|\btimingSafeEqual\s*\(|\bhmac\.(?:new|compare_digest)\s*\(/;

export const shopWebhookNoSignatureRule: Rule = {
  id: 'shop/webhook-no-signature',
  category: 'security',
  severity: 'critical',
  pack: 'shop',
  run(ctx) {
    const hits: RuleHit[] = [];
    for (const file of ctx.files) {
      if (file.kind !== 'code' || file.content === null || !WEBHOOK_PATH.test(file.path)) continue;
      if (SIGNATURE_CHECK.test(file.content)) continue;
      hits.push({
        file: file.path,
        ...say('finding.shop-webhook', { file: file.path }),
        key: '',
      });
    }
    return hits;
  },
};
