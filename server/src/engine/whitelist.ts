import type { DetectionMatch } from '@text-guard/shared';

interface WhitelistRule {
  description: string;
  regexp: RegExp;
}

const whitelistRules: WhitelistRule[] = [
  // Whitelist official Anthropic / GitHub / company domains so they are not flagged as risky links
  { description: '官方网站白名单', regexp: /https?:\/\/(?:www\.)?(?:anthropic\.com|github\.com|google\.com)\b[^\s]*/gi },
  // Whitelist common test placeholders (avoid noisy hits on example data)
  { description: '示例占位符', regexp: /\b(?:example|test|sample)@(?:example|test)\.(?:com|org)\b/gi },
];

function isInsideWhitelist(text: string, match: DetectionMatch): boolean {
  for (const rule of whitelistRules) {
    rule.regexp.lastIndex = 0;
    for (const hit of text.matchAll(rule.regexp)) {
      const start = hit.index ?? 0;
      const end = start + hit[0].length;
      if (match.start >= start && match.end <= end) return true;
    }
  }
  return false;
}

export function applyWhitelist(text: string, matches: DetectionMatch[]): DetectionMatch[] {
  if (matches.length === 0) return matches;
  return matches.filter((match) => !isInsideWhitelist(text, match));
}

export function listWhitelistRules() {
  return whitelistRules.map((rule) => ({ description: rule.description }));
}
