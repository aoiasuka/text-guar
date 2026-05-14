import type { DetectionMatch, DetectionResult, RiskLevel } from '@text-guard/shared';
import { applyReplacement } from './filter.js';
import { scanByRegex } from './regex-rules.js';
import { getFilterStrategy, getRiskLevel, riskWeight } from './risk-scorer.js';

export interface SensitiveWordEntry {
  word: string;
  riskLevel: RiskLevel;
  replacement: string;
  category: string;
}

interface TrieNode {
  next: Map<string, TrieNode>;
  fail?: TrieNode;
  outputs: SensitiveWordEntry[];
}

function createNode(): TrieNode {
  return { next: new Map(), outputs: [] };
}

const MAX_CACHE = 200;
const MAX_CACHE_TEXT_LEN = 4096;

export class SensitiveDetector {
  private words: SensitiveWordEntry[] = [];
  private root: TrieNode = createNode();
  private version = 0;
  private cache = new Map<string, DetectionResult>();

  rebuild(words: SensitiveWordEntry[]) {
    this.words = [...words].sort((a, b) => b.word.length - a.word.length);
    this.root = createNode();
    for (const word of this.words) this.insert(word);
    this.buildFailureLinks();
    this.version += 1;
    this.cache.clear();
  }

  get size() {
    return this.words.length;
  }

  detect(text: string): DetectionResult {
    if (!text) return emptyResult(text);

    const useCache = text.length <= MAX_CACHE_TEXT_LEN;
    if (useCache) {
      const cached = this.cache.get(text);
      if (cached) return cached;
    }

    const wordMatches = this.scanWords(text);
    const regexMatches = scanByRegex(text);
    const matches = this.deduplicate([...wordMatches, ...regexMatches]);
    const score = matches.reduce((sum, item) => sum + riskWeight[item.riskLevel], 0);
    const level = getRiskLevel(score);
    const strategy = getFilterStrategy(score);
    const filteredText = applyReplacement(text, matches);

    const result: DetectionResult = {
      matches,
      score,
      level,
      strategy,
      filteredText,
      summary: matches.length
        ? `命中 ${matches.length} 项风险，评分 ${score}，建议策略：${strategy}`
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

  private scanWords(text: string): DetectionMatch[] {
    if (this.words.length === 0) return [];

    const matches: DetectionMatch[] = [];
    let node = this.root;
    const normalized = text.toLowerCase();

    for (let index = 0; index < normalized.length; index += 1) {
      const char = normalized[index];
      while (node !== this.root && !node.next.has(char)) {
        node = node.fail || this.root;
      }
      node = node.next.get(char) || this.root;

      if (node.outputs.length === 0) continue;
      for (const item of node.outputs) {
        const start = index - item.word.length + 1;
        const hit = text.slice(start, index + 1);
        matches.push({
          type: 'word',
          word: hit,
          riskLevel: item.riskLevel,
          category: item.category,
          replacement: item.replacement || '***',
          start,
          end: index + 1,
        });
      }
    }

    return matches;
  }

  private insert(item: SensitiveWordEntry) {
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

  private deduplicate(matches: DetectionMatch[]) {
    if (matches.length <= 1) return matches;

    matches.sort((a, b) => a.start - b.start || b.end - a.end);
    const result: DetectionMatch[] = [];
    const seen = new Set<string>();

    for (const match of matches) {
      const key = `${match.start}:${match.end}:${match.word}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(match);
    }
    return result;
  }
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
