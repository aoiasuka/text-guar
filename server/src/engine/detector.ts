import type { DetectionMatch, DetectionResult, RiskLevel } from '@text-guard/shared';
import { applyReplacement } from './filter.js';
import { credentialRules } from './credential-rules.js';
import { disambiguate, type ContextScope } from './context-disambiguator.js';
import { judgeFullText, judgeUnsure, isLLMEnabled } from './llm-judge.js';
import {
  expandVariants,
  mapToOriginalRange,
  normalize,
  type NormalizedText,
  type VariantCandidate,
} from './normalizer.js';
import { pinyin } from 'pinyin-pro';
import { scanByRegex } from './regex-rules.js';
import { compileUserPattern, RegexSafeError, type CompiledPattern } from './regex-safe.js';
import { CONFIDENCE_DROP_BELOW, getFilterStrategy, getRiskLevel, scoreMatches } from './risk-scorer.js';
import { applyWhitelist } from './whitelist.js';

export type SensitiveMatchMode = 'literal' | 'regex' | 'credential';

export interface SensitiveWordEntry {
  word: string;
  matchType?: SensitiveMatchMode;
  pattern?: string | null;
  riskLevel: RiskLevel;
  replacement: string;
  category: string;
  baseConfidence?: number;
  variantMatch?: boolean;
  contextScope?: ContextScope;
}

interface LiteralEntry {
  word: string;
  riskLevel: RiskLevel;
  replacement: string;
  category: string;
  baseConfidence: number;
  variantMatch: boolean;
  contextScope: ContextScope;
}

interface RegexEntry {
  word: string;
  compiled: CompiledPattern;
  riskLevel: RiskLevel;
  replacement: string;
  category: string;
  baseConfidence: number;
}

interface CredentialMeta {
  word: string;
  riskLevel: RiskLevel;
  replacement: string;
  category: string;
  baseConfidence: number;
}

interface TrieNode {
  next: Map<string, TrieNode>;
  fail?: TrieNode;
  outputs: LiteralEntry[];
}

function createNode(): TrieNode {
  return { next: new Map(), outputs: [] };
}

const MAX_CACHE = 200;
const MAX_CACHE_TEXT_LEN = 4096;
const VARIANT_CONFIDENCE_DISCOUNT = 0.75;
const PINYIN_FULL_MIN_LEN = 4; // 仅命中 ≥4 字母（约 2 个汉字）的拼音才认，避免单字误报

const riskRank: Record<RiskLevel, number> = { low: 1, medium: 2, high: 3 };

export class SensitiveDetector {
  private literalWords: LiteralEntry[] = [];
  private regexEntries: RegexEntry[] = [];
  private credentialMeta: CredentialMeta | null = null;
  private plainRoot: TrieNode = createNode();
  private pinyinRoot: TrieNode = createNode();
  private version = 0;
  private cache = new Map<string, DetectionResult>();

  rebuild(words: SensitiveWordEntry[]) {
    const literal: LiteralEntry[] = [];
    const regex: RegexEntry[] = [];
    let credentialBest: CredentialMeta | null = null;

    for (const item of words) {
      const matchType = item.matchType || 'literal';
      const baseConfidence = item.baseConfidence ?? 1;
      if (matchType === 'literal') {
        literal.push({
          word: item.word,
          riskLevel: item.riskLevel,
          replacement: item.replacement,
          category: item.category,
          baseConfidence,
          variantMatch: item.variantMatch !== false,
          contextScope: item.contextScope ?? 'strict',
        });
      } else if (matchType === 'regex') {
        if (!item.pattern) continue;
        try {
          regex.push({
            word: item.word,
            compiled: compileUserPattern(item.pattern),
            riskLevel: item.riskLevel,
            replacement: item.replacement,
            category: item.category,
            baseConfidence,
          });
        } catch (error) {
          const reason = error instanceof RegexSafeError ? error.reason : 'invalid';
          console.warn(
            `[detector] 正则规则编译失败 word=${item.word} pattern=${item.pattern} (${reason})：`,
            error instanceof Error ? error.message : error,
          );
        }
      } else if (matchType === 'credential') {
        const meta: CredentialMeta = {
          word: item.word,
          riskLevel: item.riskLevel,
          replacement: item.replacement || '[凭证]',
          category: item.category,
          baseConfidence,
        };
        if (!credentialBest || riskRank[meta.riskLevel] > riskRank[credentialBest.riskLevel]) {
          credentialBest = meta;
        }
      }
    }

    this.literalWords = literal.sort((a, b) => b.word.length - a.word.length);
    this.regexEntries = regex;
    this.credentialMeta = credentialBest;
    this.plainRoot = createNode();
    this.pinyinRoot = createNode();
    for (const entry of this.literalWords) {
      this.insertLiteral(this.plainRoot, entry.word.toLowerCase(), entry);
      if (entry.variantMatch) {
        const pinyinKey = toPinyinKey(entry.word);
        if (pinyinKey.length >= PINYIN_FULL_MIN_LEN) {
          this.insertLiteral(this.pinyinRoot, pinyinKey, entry);
        }
      }
    }
    this.buildFailureLinks(this.plainRoot);
    this.buildFailureLinks(this.pinyinRoot);
    this.version += 1;
    this.cache.clear();
  }

  get size() {
    return this.literalWords.length + this.regexEntries.length + (this.credentialMeta ? 1 : 0);
  }

  /**
   * 给 AI 复核用的"业务敏感词库摘要"：按 category 分组，每组挑前 N 个示例词。
   * 让本地小模型在零规则命中时也能感知项目关心哪些类型的内容。
   */
  getCategorySummary(maxPerCategory = 5): Record<string, string[]> {
    const map: Record<string, string[]> = {};
    const add = (cat: string, word: string) => {
      const key = cat || '默认';
      if (!map[key]) map[key] = [];
      if (map[key].length < maxPerCategory && !map[key].includes(word)) map[key].push(word);
    };
    for (const w of this.literalWords) add(w.category, w.word);
    for (const r of this.regexEntries) add(r.category, r.word);
    if (this.credentialMeta) add(this.credentialMeta.category, '[凭证识别·内置规则]');
    return map;
  }

  detect(text: string): DetectionResult {
    if (!text) return emptyResult(text);

    const useCache = text.length <= MAX_CACHE_TEXT_LEN;
    if (useCache) {
      const cached = this.cache.get(text);
      if (cached) return cached;
    }

    const normalized = normalize(text);
    const wordMatches = this.scanLiterals(text, normalized);
    const variantMatches = this.scanVariants(text, normalized);
    const regexMatches = scanByRegex(text);
    const customRegexMatches = this.scanCustomRegex(text);
    const credentialMatches = this.scanCredentials(text);
    const all = [
      ...wordMatches,
      ...variantMatches,
      ...regexMatches,
      ...customRegexMatches,
      ...credentialMatches,
    ];
    const merged = mergeOverlapping(all, text);
    const whitelisted = applyWhitelist(text, merged);
    // 上下文消歧：在过滤前调整 confidence
    // 取最严格的 scope（多条规则混合时按 strict > lenient > global）
    const effectiveScope = this.literalWords.length
      ? mostStrictScope(this.literalWords.map((w) => w.contextScope))
      : 'strict';
    const disambiguated = disambiguate(text, whitelisted, { defaultScope: effectiveScope });
    const filtered = disambiguated.filter((m) => (m.confidence ?? 1) >= CONFIDENCE_DROP_BELOW);
    const score = Math.round(scoreMatches(filtered));
    const level = getRiskLevel(score);
    const strategy = getFilterStrategy(score);
    const filteredText = applyReplacement(text, filtered);

    const result: DetectionResult = {
      matches: filtered,
      score,
      level,
      strategy,
      filteredText,
      summary: filtered.length
        ? `命中 ${filtered.length} 项风险，评分 ${score}，建议策略：${strategy}`
        : '未发现敏感信息',
    };

    if (useCache) {
      if (this.cache.size >= MAX_CACHE) {
        const firstKey = this.cache.keys().next().value;
        if (firstKey !== undefined) this.cache.delete(firstKey);
      }
      this.cache.set(text, result);
    }

    return result;
  }

  private scanLiterals(original: string, normalized: NormalizedText): DetectionMatch[] {
    if (this.literalWords.length === 0) return [];
    return scanTrie(this.plainRoot, normalized.text, (item, nStart, nEnd) => {
      const range = mapToOriginalRange(normalized, nStart, nEnd);
      return {
        type: 'word',
        word: original.slice(range.start, range.end),
        riskLevel: item.riskLevel,
        category: item.category,
        replacement: item.replacement || '***',
        start: range.start,
        end: range.end,
        source: 'literal',
        confidence: item.baseConfidence,
      };
    });
  }

  private scanVariants(original: string, normalized: NormalizedText): DetectionMatch[] {
    if (this.literalWords.length === 0) return [];
    const candidates = expandVariants(normalized);
    const matches: DetectionMatch[] = [];

    for (const cand of candidates) {
      const usePinyin = cand.label === 'pinyin_full' || cand.label === 'pinyin_initial';
      const root = usePinyin ? this.pinyinRoot : this.plainRoot;
      const hits = scanTrie(root, cand.text, (item, nStart, nEnd) => {
        const range = mapToOriginalRange(cand, nStart, nEnd);
        if (usePinyin && nEnd - nStart < PINYIN_FULL_MIN_LEN) return null;
        const trimmed = trimNoiseEdges(original, range.start, range.end);
        if (trimmed.end <= trimmed.start) return null;
        const word = original.slice(trimmed.start, trimmed.end);
        return {
          type: 'word',
          word,
          riskLevel: item.riskLevel,
          category: item.category,
          replacement: item.replacement || '***',
          start: trimmed.start,
          end: trimmed.end,
          source: 'literal_variant',
          confidence: item.baseConfidence * VARIANT_CONFIDENCE_DISCOUNT,
          reason: `变体匹配·${cand.label}`,
        };
      });
      matches.push(...hits);
    }
    return matches;
  }

  private scanCustomRegex(text: string): DetectionMatch[] {
    if (this.regexEntries.length === 0) return [];
    const matches: DetectionMatch[] = [];
    for (const rule of this.regexEntries) {
      for (const hit of rule.compiled.matchAll(text)) {
        matches.push({
          type: 'regex',
          word: hit.match,
          riskLevel: rule.riskLevel,
          category: rule.category,
          replacement: rule.replacement || '***',
          start: hit.index,
          end: hit.index + hit.match.length,
          source: 'regex',
          confidence: rule.baseConfidence * 0.95,
        });
      }
    }
    return matches;
  }

  private scanCredentials(text: string): DetectionMatch[] {
    if (!this.credentialMeta) return [];
    const userMeta = this.credentialMeta; // 词库 credential 记录覆盖规则默认 meta
    const matches: DetectionMatch[] = [];
    for (const rule of credentialRules) {
      rule.pattern.lastIndex = 0;
      for (const hit of text.matchAll(rule.pattern)) {
        const raw = hit[0];
        const start = hit.index ?? 0;
        // 优先用每条规则自带的 category/risk/replacement，缺省回退到用户配置的 userMeta
        const riskLevel = rule.baseRisk ?? userMeta.riskLevel;
        const replacement = rule.defaultReplacement || userMeta.replacement;
        const category = rule.category || userMeta.category;
        matches.push({
          type: 'regex',
          word: raw,
          riskLevel,
          category,
          replacement,
          start,
          end: start + raw.length,
          source: 'credential',
          confidence: userMeta.baseConfidence * 0.9,
          reason: `凭证·${rule.id}`,
        });
      }
    }
    return matches;
  }

  private insertLiteral(root: TrieNode, key: string, item: LiteralEntry) {
    let node = root;
    for (const char of key) {
      const next = node.next.get(char) || createNode();
      node.next.set(char, next);
      node = next;
    }
    node.outputs.push({ ...item, word: key });
  }

  private buildFailureLinks(root: TrieNode) {
    const queue: TrieNode[] = [];
    for (const child of root.next.values()) {
      child.fail = root;
      queue.push(child);
    }
    while (queue.length) {
      const current = queue.shift()!;
      for (const [char, child] of current.next) {
        let fail = current.fail || root;
        while (fail !== root && !fail.next.has(char)) {
          fail = fail.fail || root;
        }
        child.fail = fail.next.get(char) || root;
        child.outputs = [...child.outputs, ...child.fail.outputs];
        queue.push(child);
      }
    }
  }
}

// Aho-Corasick 通用扫描：mapHit 返回 null 表示丢弃这次命中
function scanTrie(
  root: TrieNode,
  text: string,
  mapHit: (item: LiteralEntry, nStart: number, nEnd: number) => DetectionMatch | null,
): DetectionMatch[] {
  if (root.next.size === 0 || !text) return [];
  const matches: DetectionMatch[] = [];
  let node = root;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    while (node !== root && !node.next.has(char)) {
      node = node.fail || root;
    }
    node = node.next.get(char) || root;
    if (node.outputs.length === 0) continue;
    for (const item of node.outputs) {
      const nStart = index - item.word.length + 1;
      const nEnd = index + 1;
      const m = mapHit(item, nStart, nEnd);
      if (m) matches.push(m);
    }
  }
  return matches;
}

function toPinyinKey(word: string): string {
  // 把中文词条转成纯拼音字母串，非中文字符按小写保留
  const chars: string[] = [];
  for (const ch of word) {
    if (/[一-鿿]/.test(ch)) {
      const py = pinyin(ch, { toneType: 'none', type: 'string' }).replace(/\s+/g, '');
      chars.push(py || ch);
    } else {
      chars.push(ch.toLowerCase());
    }
  }
  return chars.join('');
}

// 变体扫描映射回原文后，trim 两端的噪声字符（空格/标点干扰），让命中片段紧凑
const NOISE_TRIM_RE = /[\s·_\-*\.・|/\\@#!$%^&+=?`~,;:"']/;
function trimNoiseEdges(text: string, start: number, end: number): { start: number; end: number } {
  let s = start;
  let e = end;
  while (e > s && NOISE_TRIM_RE.test(text[e - 1])) e -= 1;
  while (s < e && NOISE_TRIM_RE.test(text[s])) s += 1;
  return { start: s, end: e };
}

// 默认对所有 literal 词条启用变体匹配；上游通过 entry.variantMatch=false 关闭
// 多条规则混合时取最严格的 scope（strict 优先，其次 lenient，最后 global）
function mostStrictScope(scopes: ContextScope[]): ContextScope {
  if (scopes.includes('strict')) return 'strict';
  if (scopes.includes('lenient')) return 'lenient';
  return 'global';
}

function compareForMerge(a: DetectionMatch, b: DetectionMatch) {
  if (a.start !== b.start) return a.start - b.start;
  if (a.end !== b.end) return b.end - a.end;
  return riskRank[b.riskLevel] - riskRank[a.riskLevel];
}

export function mergeOverlapping(matches: DetectionMatch[], text?: string): DetectionMatch[] {
  if (matches.length <= 1) return [...matches];
  const sorted = [...matches].sort(compareForMerge);

  const result: DetectionMatch[] = [];
  for (const match of sorted) {
    const last = result[result.length - 1];
    if (!last || match.start >= last.end) {
      result.push(match);
      continue;
    }
    const unionStart = Math.min(last.start, match.start);
    const unionEnd = Math.max(last.end, match.end);
    const matchRank = riskRank[match.riskLevel];
    const lastRank = riskRank[last.riskLevel];
    const keepMatchMeta =
      matchRank > lastRank ||
      (matchRank === lastRank && match.end - match.start > last.end - last.start);
    const base = keepMatchMeta ? match : last;
    // 合并后置信度取两者较高（同一片段最强证据）
    const bestConfidence = Math.max(match.confidence ?? 1, last.confidence ?? 1);
    result[result.length - 1] = {
      ...base,
      start: unionStart,
      end: unionEnd,
      word: text ? text.slice(unionStart, unionEnd) : base.word,
      confidence: bestConfidence,
    };
  }
  return result;
}

function emptyResult(text: string): DetectionResult {
  return {
    matches: [],
    score: 0,
    level: 'low',
    strategy: 'replace',
    filteredText: text,
    summary: '未发现敏感信息',
  };
}

export const detector = new SensitiveDetector();

/**
 * 异步检测：在 detector.detect 之上叠加 LLM 判定
 * - LLM_JUDGE_ENABLED=false 时与 detect() 等价
 * - 启用时：
 *   · 规则有命中 → 对每条命中逐条调 judgeUnsure 复核（可改写置信度/verdict）
 *   · 规则零命中 → 调 judgeFullText 整段判定（兜底覆盖词库外的风险）
 *   · 不管有没有命中，启用 LLM 后每次检测都至少触发 1 次 AI 调用
 */
export async function detectWithLLM(text: string): Promise<DetectionResult> {
  const base = detector.detect(text);
  if (!isLLMEnabled()) return base;

  // 把当前敏感词库摘要带给 AI，让本地小模型感知项目业务关注的风险类别
  const catalog = detector.getCategorySummary();

  let matches: DetectionMatch[];
  if (base.matches.length === 0) {
    // 规则零命中 → AI 全文兜底判定（带词库摘要可识别广告软文/凭证泄漏等隐性风险）
    const aiHit = await judgeFullText(text, catalog);
    matches = aiHit ? [aiHit] : [];
  } else {
    // 规则有命中 → AI 逐条复核（带词库摘要可借助同 category 的近邻词消歧）
    matches = await judgeUnsure(base.matches, text, catalog);
  }

  const filtered = matches.filter((m) => (m.confidence ?? 1) >= CONFIDENCE_DROP_BELOW);
  const score = Math.round(scoreMatches(filtered));
  const level = getRiskLevel(score);
  const strategy = getFilterStrategy(score);
  const filteredText = applyReplacement(text, filtered);
  return {
    matches: filtered,
    score,
    level,
    strategy,
    filteredText,
    summary: filtered.length
      ? `命中 ${filtered.length} 项风险，评分 ${score}，建议策略：${strategy}`
      : '未发现敏感信息',
  };
}
