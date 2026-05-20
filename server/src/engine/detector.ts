import type { DetectionMatch, DetectionResult, RiskLevel } from '@text-guard/shared';
import { applyReplacement } from './filter.js';
import { credentialPatterns } from './credential-rules.js';
import { mapToOriginalRange, normalize } from './normalizer.js';
import { scanByRegex } from './regex-rules.js';
import { getFilterStrategy, getRiskLevel, riskWeight } from './risk-scorer.js';
import { applyWhitelist } from './whitelist.js';

export type SensitiveMatchMode = 'literal' | 'regex' | 'credential';

export interface SensitiveWordEntry {
  word: string;
  matchType?: SensitiveMatchMode;
  pattern?: string | null;
  riskLevel: RiskLevel;
  replacement: string;
  category: string;
}

interface LiteralEntry {
  word: string;
  riskLevel: RiskLevel;
  replacement: string;
  category: string;
}

interface RegexEntry {
  word: string;
  regexp: RegExp;
  riskLevel: RiskLevel;
  replacement: string;
  category: string;
}

interface CredentialMeta {
  word: string;
  riskLevel: RiskLevel;
  replacement: string;
  category: string;
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

const riskRank: Record<RiskLevel, number> = { low: 1, medium: 2, high: 3 };

export class SensitiveDetector {
  private literalWords: LiteralEntry[] = [];
  private regexEntries: RegexEntry[] = [];
  private credentialMeta: CredentialMeta | null = null;
  private root: TrieNode = createNode();
  private version = 0;
  private cache = new Map<string, DetectionResult>();

  rebuild(words: SensitiveWordEntry[]) {
    const literal: LiteralEntry[] = [];
    const regex: RegexEntry[] = [];
    let credentialBest: CredentialMeta | null = null;

    for (const item of words) {
      const matchType = item.matchType || 'literal';
      if (matchType === 'literal') {
        literal.push({
          word: item.word,
          riskLevel: item.riskLevel,
          replacement: item.replacement,
          category: item.category,
        });
      } else if (matchType === 'regex') {
        if (!item.pattern) continue;
        try {
          regex.push({
            word: item.word,
            regexp: compileRegex(item.pattern),
            riskLevel: item.riskLevel,
            replacement: item.replacement,
            category: item.category,
          });
        } catch (error) {
          console.warn(
            `[detector] 正则规则编译失败 word=${item.word} pattern=${item.pattern}：`,
            error instanceof Error ? error.message : error,
          );
        }
      } else if (matchType === 'credential') {
        const meta: CredentialMeta = {
          word: item.word,
          riskLevel: item.riskLevel,
          replacement: item.replacement || '[凭证]',
          category: item.category,
        };
        if (!credentialBest || riskRank[meta.riskLevel] > riskRank[credentialBest.riskLevel]) {
          credentialBest = meta;
        }
      }
    }

    this.literalWords = literal.sort((a, b) => b.word.length - a.word.length);
    this.regexEntries = regex;
    this.credentialMeta = credentialBest;
    this.root = createNode();
    for (const word of this.literalWords) this.insertLiteral(word);
    this.buildFailureLinks();
    this.version += 1;
    this.cache.clear();
  }

  get size() {
    return this.literalWords.length + this.regexEntries.length + (this.credentialMeta ? 1 : 0);
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
    const regexMatches = scanByRegex(text);
    const customRegexMatches = this.scanCustomRegex(text);
    const credentialMatches = this.scanCredentials(text);
    const all = [...wordMatches, ...regexMatches, ...customRegexMatches, ...credentialMatches];
    const merged = mergeOverlapping(all, text);
    const filtered = applyWhitelist(text, merged);
    const score = filtered.reduce((sum, item) => sum + riskWeight[item.riskLevel], 0);
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

  private scanLiterals(
    original: string,
    normalized: ReturnType<typeof normalize>,
  ): DetectionMatch[] {
    if (this.literalWords.length === 0) return [];

    const matches: DetectionMatch[] = [];
    let node = this.root;

    for (let index = 0; index < normalized.text.length; index += 1) {
      const char = normalized.text[index];
      while (node !== this.root && !node.next.has(char)) {
        node = node.fail || this.root;
      }
      node = node.next.get(char) || this.root;

      if (node.outputs.length === 0) continue;
      for (const item of node.outputs) {
        const normalizedStart = index - item.word.length + 1;
        const normalizedEnd = index + 1;
        const range = mapToOriginalRange(normalized, normalizedStart, normalizedEnd);
        const hit = original.slice(range.start, range.end);
        matches.push({
          type: 'word',
          word: hit,
          riskLevel: item.riskLevel,
          category: item.category,
          replacement: item.replacement || '***',
          start: range.start,
          end: range.end,
        });
      }
    }

    return matches;
  }

  private scanCustomRegex(text: string): DetectionMatch[] {
    if (this.regexEntries.length === 0) return [];
    const matches: DetectionMatch[] = [];
    for (const rule of this.regexEntries) {
      rule.regexp.lastIndex = 0;
      for (const hit of text.matchAll(rule.regexp)) {
        const raw = hit[0];
        const start = hit.index ?? 0;
        matches.push({
          type: 'regex',
          word: raw,
          riskLevel: rule.riskLevel,
          category: rule.category,
          replacement: rule.replacement || '***',
          start,
          end: start + raw.length,
        });
      }
    }
    return matches;
  }

  private scanCredentials(text: string): DetectionMatch[] {
    if (!this.credentialMeta) return [];
    const meta = this.credentialMeta;
    const matches: DetectionMatch[] = [];
    for (const pattern of credentialPatterns) {
      pattern.lastIndex = 0;
      for (const hit of text.matchAll(pattern)) {
        const raw = hit[0];
        const start = hit.index ?? 0;
        matches.push({
          type: 'regex',
          word: raw,
          riskLevel: meta.riskLevel,
          category: meta.category,
          replacement: meta.replacement,
          start,
          end: start + raw.length,
        });
      }
    }
    return matches;
  }

  private insertLiteral(item: LiteralEntry) {
    let node = this.root;
    for (const char of item.word.toLowerCase()) {
      const next = node.next.get(char) || createNode();
      node.next.set(char, next);
      node = next;
    }
    node.outputs.push(item);
  }

  private buildFailureLinks() {
    const queue: TrieNode[] = [];
    for (const child of this.root.next.values()) {
      child.fail = this.root;
      queue.push(child);
    }

    while (queue.length) {
      const current = queue.shift()!;
      for (const [char, child] of current.next) {
        let fail = current.fail || this.root;
        while (fail !== this.root && !fail.next.has(char)) {
          fail = fail.fail || this.root;
        }
        child.fail = fail.next.get(char) || this.root;
        child.outputs = [...child.outputs, ...child.fail.outputs];
        queue.push(child);
      }
    }
  }
}

function compileRegex(pattern: string): RegExp {
  const flagMatch = /^\(\?([imsu]+)\)/.exec(pattern);
  if (flagMatch) {
    const flags = flagMatch[1];
    const body = pattern.slice(flagMatch[0].length);
    return new RegExp(body, `${flags}g`);
  }
  return new RegExp(pattern, 'g');
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
    result[result.length - 1] = {
      ...base,
      start: unionStart,
      end: unionEnd,
      word: text ? text.slice(unionStart, unionEnd) : base.word,
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
