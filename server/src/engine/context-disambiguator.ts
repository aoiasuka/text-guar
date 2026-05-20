import type { DetectionMatch } from '@text-guard/shared';
import { Jieba } from '@node-rs/jieba';
// 该子模块包内 typings 是 dict.d.ts、运行时是 dict.js（CommonJS）
import { dict } from '@node-rs/jieba/dict.js';

export type ContextScope = 'strict' | 'lenient' | 'global';

// 全局 jieba 单例，首次使用时懒加载（启动时不强制初始化以避免 cold start 慢）
let jiebaInstance: Jieba | null = null;
function getJieba(): Jieba {
  if (!jiebaInstance) jiebaInstance = Jieba.withDict(dict);
  return jiebaInstance;
}

// 反向劝阻关键词（出现在命中前 8 字以内时降权）
const REVERSE_KEYWORDS = [
  '不要',
  '禁止',
  '反对',
  '避免',
  '警惕',
  '防范',
  '反诈',
  '杜绝',
  '严禁',
  '请勿',
  '切勿',
  '勿要',
  '不可',
  '远离',
];

// 引号对（命中位于成对引号内时降权）
const QUOTE_PAIRS: Array<[string, string]> = [
  ['「', '」'],
  ['『', '』'],
  ['"', '"'],
  ['"', '"'],
  ["'", "'"],
  ["'", "'"],
  ['《', '》'],
  ['‘', '’'],
];

// 代码块标记：Markdown 三反引号；命中在两个 ``` 之间时降权
const CODE_FENCE = /```/g;

export interface ContextOptions {
  defaultScope?: ContextScope;
  // 每条 match 可以传入自定义 scope（来自 SensitiveWord.contextScope）
  scopeByCategory?: Record<string, ContextScope>;
}

/**
 * 对命中数组应用上下文消歧规则，调整 confidence 与 reason。
 * 仅对 source ∈ {literal, literal_variant} 的命中生效；regex/credential/llm 不动。
 */
export function disambiguate(
  text: string,
  matches: DetectionMatch[],
  opts: ContextOptions = {},
): DetectionMatch[] {
  if (matches.length === 0) return matches;
  const scope = opts.defaultScope ?? 'strict';
  if (scope === 'global') return matches;

  const fenceRanges = findCodeFenceRanges(text);

  // 同 category 命中聚类：用于"同类强化"
  const categoryCount = new Map<string, number>();
  for (const m of matches) {
    if (m.source === 'literal' || m.source === 'literal_variant') {
      categoryCount.set(m.category, (categoryCount.get(m.category) ?? 0) + 1);
    }
  }

  return matches.map((m) => {
    if (m.source !== 'literal' && m.source !== 'literal_variant') return m;

    const reasons: string[] = m.reason ? [m.reason] : [];
    let multiplier = 1;

    // 规则 1：代码块（最强信号，最先判定）
    if (isInsideRange(m.start, m.end, fenceRanges)) {
      multiplier *= 0.3;
      reasons.push('code');
      return apply(m, multiplier, reasons);
    }

    // 规则 2：引号（lenient 模式只跑引号 + 代码块）
    if (isInsideQuotes(text, m.start, m.end)) {
      multiplier *= 0.5;
      reasons.push('quoted');
    }
    if (scope === 'lenient') return apply(m, multiplier, reasons);

    // strict 模式补加 3-5 条规则
    // 规则 3：反向劝阻
    const ctxBefore = text.slice(Math.max(0, m.start - 8), m.start);
    for (const kw of REVERSE_KEYWORDS) {
      if (ctxBefore.includes(kw)) {
        multiplier *= 0.4;
        reasons.push(`reverse(${kw})`);
        break;
      }
    }

    // 规则 4：复合词检测（jieba 分词后命中区间被某个更长 token 完整包含 → 复合词，降权）
    if (isCompoundToken(text, m.start, m.end)) {
      multiplier *= 0.5;
      reasons.push('compound_token');
    }

    // 规则 5：同类强化（窗口 ±20 字内有同 category 的其他命中 → 加权，封顶 1.0）
    const sameCategory = (categoryCount.get(m.category) ?? 0) > 1;
    if (sameCategory && hasNearbySameCategory(matches, m)) {
      multiplier = Math.min(multiplier * 1.1, multiplier > 0.8 ? 1 : multiplier * 1.1);
      reasons.push('cluster');
    }

    return apply(m, multiplier, reasons);
  });
}

function apply(m: DetectionMatch, mult: number, reasons: string[]): DetectionMatch {
  const oldConf = m.confidence ?? 1;
  return {
    ...m,
    confidence: Math.min(1, oldConf * mult),
    reason: reasons.length ? reasons.join(' / ') : undefined,
  };
}

function findCodeFenceRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  CODE_FENCE.lastIndex = 0;
  const positions: number[] = [];
  for (const hit of text.matchAll(CODE_FENCE)) {
    positions.push(hit.index ?? 0);
  }
  for (let i = 0; i + 1 < positions.length; i += 2) {
    ranges.push([positions[i], positions[i + 1] + 3]);
  }
  return ranges;
}

function isInsideRange(start: number, end: number, ranges: Array<[number, number]>): boolean {
  return ranges.some(([rs, re]) => start >= rs && end <= re);
}

function isInsideQuotes(text: string, start: number, end: number): boolean {
  for (const [open, close] of QUOTE_PAIRS) {
    const openIdx = text.lastIndexOf(open, start);
    if (openIdx === -1) continue;
    const closeIdx = text.indexOf(close, end);
    if (closeIdx === -1) continue;
    // 确保 openIdx 和 closeIdx 之间没有同符号的额外 open/close（避免跨段误判，简化处理）
    if (openIdx < start && closeIdx >= end) return true;
  }
  return false;
}

function isCompoundToken(text: string, start: number, end: number): boolean {
  const jieba = getJieba();
  // 只对命中周围 60 字范围分词，避免对超长文本全量分词
  const winStart = Math.max(0, start - 30);
  const winEnd = Math.min(text.length, end + 30);
  const segment = text.slice(winStart, winEnd);
  const tokens = jieba.cut(segment, true);
  // 在 segment 内累积 offset，定位命中相对位置
  const relStart = start - winStart;
  const relEnd = end - winStart;
  let cursor = 0;
  for (const tok of tokens) {
    const tokStart = cursor;
    const tokEnd = cursor + tok.length;
    cursor = tokEnd;
    // 命中区间被某个更长的 token 完整包含 → 视为复合词
    if (tokStart <= relStart && tokEnd >= relEnd && tok.length > relEnd - relStart) {
      return true;
    }
  }
  return false;
}

function hasNearbySameCategory(matches: DetectionMatch[], target: DetectionMatch): boolean {
  return matches.some(
    (m) =>
      m !== target &&
      m.category === target.category &&
      Math.abs(m.start - target.start) <= 20,
  );
}
