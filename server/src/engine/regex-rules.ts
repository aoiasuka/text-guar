import type { DetectionMatch, RiskLevel } from '@text-guard/shared';

interface RegexRule {
  word: string;
  category: string;
  riskLevel: RiskLevel;
  replacement: string;
  regexp: RegExp;
  validate?: (matched: string) => boolean;
}

function isValidBankCard(value: string) {
  const digits = value.replace(/\s+/g, '');
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let doubleIt = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let n = Number(digits[i]);
    if (Number.isNaN(n)) return false;
    if (doubleIt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    doubleIt = !doubleIt;
  }
  return sum % 10 === 0;
}

function isValidIdCard(value: string) {
  if (!/^\d{17}[\dXx]$/.test(value)) return false;
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const checks = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2'];
  let sum = 0;
  for (let i = 0; i < 17; i += 1) sum += Number(value[i]) * weights[i];
  return checks[sum % 11] === value[17].toUpperCase();
}

const rules: RegexRule[] = [
  {
    word: '手机号',
    category: '个人信息',
    riskLevel: 'medium',
    replacement: '[手机号]',
    regexp: /(?<!\d)1[3-9]\d{9}(?!\d)/g,
  },
  {
    word: '身份证号',
    category: '个人信息',
    riskLevel: 'high',
    replacement: '[身份证号]',
    regexp: /(?<![\dXx])\d{17}[\dXx](?![\dXx])/g,
    validate: isValidIdCard,
  },
  {
    word: '邮箱',
    category: '个人信息',
    riskLevel: 'low',
    replacement: '[邮箱]',
    regexp: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  },
  {
    word: 'IPv4 地址',
    category: '网络标识',
    riskLevel: 'low',
    replacement: '[IP]',
    regexp: /\b(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\b/g,
  },
  {
    word: 'IPv6 地址',
    category: '网络标识',
    riskLevel: 'low',
    replacement: '[IPv6]',
    regexp: /\b(?:[A-Fa-f0-9]{1,4}:){7}[A-Fa-f0-9]{1,4}\b/g,
  },
  {
    word: '银行卡号',
    category: '金融信息',
    riskLevel: 'high',
    replacement: '[银行卡号]',
    regexp: /(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)/g,
    validate: (value) => isValidBankCard(value),
  },
  {
    word: 'URL',
    category: '网络标识',
    riskLevel: 'low',
    replacement: '[链接]',
    regexp: /\bhttps?:\/\/[^\s<>"]+/gi,
  },
  {
    word: '车牌号',
    category: '个人信息',
    riskLevel: 'medium',
    replacement: '[车牌号]',
    regexp:
      /[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼使领]{1}[A-Z]{1}[A-HJ-NP-Z0-9]{4,5}[A-HJ-NP-Z0-9挂学警港澳]{1}/g,
  },
  {
    word: '统一社会信用代码',
    category: '组织信息',
    riskLevel: 'medium',
    replacement: '[信用代码]',
    regexp: /(?<![A-Z0-9])[0-9A-HJ-NPQRTUWXY]{2}\d{6}[0-9A-HJ-NPQRTUWXY]{10}(?![A-Z0-9])/g,
  },
  {
    word: 'QQ 号',
    category: '社交账号',
    riskLevel: 'low',
    replacement: '[QQ]',
    regexp: /(?:qq|扣扣|企鹅)[:：\s]*([1-9]\d{4,11})/gi,
  },
  {
    word: '微信号',
    category: '社交账号',
    riskLevel: 'low',
    replacement: '[微信]',
    regexp: /(?:微信|weixin|vx|wx)[:：\s]*([A-Za-z][A-Za-z0-9_-]{5,19})/gi,
  },
];

export function scanByRegex(text: string): DetectionMatch[] {
  if (!text) return [];
  const matches: DetectionMatch[] = [];
  for (const rule of rules) {
    rule.regexp.lastIndex = 0;
    for (const hit of text.matchAll(rule.regexp)) {
      const raw = hit[0];
      if (rule.validate && !rule.validate(raw)) continue;
      const start = hit.index ?? 0;
      matches.push({
        type: 'regex',
        word: raw,
        riskLevel: rule.riskLevel,
        category: rule.category,
        replacement: rule.replacement,
        start,
        end: start + raw.length,
        source: 'regex',
        confidence: 0.95,
      });
    }
  }
  return matches;
}

export function listRegexRules() {
  return rules.map(({ word, category, riskLevel, replacement }) => ({
    word,
    category,
    riskLevel,
    replacement,
  }));
}
