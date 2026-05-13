import type { DetectionMatch } from '@text-guard/shared';

const rules = [
  {
    word: '手机号',
    category: '个人信息',
    riskLevel: 'medium',
    replacement: '[手机号]',
    regexp: /1[3-9]\d{9}/g,
  },
  {
    word: '身份证号',
    category: '个人信息',
    riskLevel: 'high',
    replacement: '[身份证号]',
    regexp: /\b\d{17}[\dXx]\b/g,
  },
  {
    word: '邮箱',
    category: '个人信息',
    riskLevel: 'low',
    replacement: '[邮箱]',
    regexp: /[\w.-]+@[\w.-]+\.\w+/g,
  },
  {
    word: 'IP 地址',
    category: '网络标识',
    riskLevel: 'low',
    replacement: '[IP]',
    regexp: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
  },
] as const;

export function scanByRegex(text: string): DetectionMatch[] {
  return rules.flatMap((rule) => {
    const matches: DetectionMatch[] = [];
    for (const hit of text.matchAll(rule.regexp)) {
      const start = hit.index ?? 0;
      matches.push({
        type: 'regex',
        word: hit[0],
        riskLevel: rule.riskLevel,
        category: rule.category,
        replacement: rule.replacement,
        start,
        end: start + hit[0].length,
      });
    }
    return matches;
  });
}
