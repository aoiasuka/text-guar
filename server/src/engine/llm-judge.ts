import { createHash } from 'node:crypto';
import type { DetectionMatch } from '@text-guard/shared';

/**
 * 本地 LLM 二次判定：调 Ollama HTTP API（无外部网络，零成本）
 * - 默认禁用（env LLM_JUDGE_ENABLED=true 启用）
 * - 仅对 confidence ∈ [0.5, 0.85) 的命中并发判定（不挑高置信度的，节省算力）
 * - 内置 1h LRU 缓存（key = sha256(model + word + ctx)）
 * - 超时/错误 → fallback 为 sensitive（保守不放过）
 */

export type Verdict = 'sensitive' | 'neutral' | 'quote' | 'reverse';

export interface JudgeResult {
  verdict: Verdict;
  reason: string;
}

interface JudgeOptions {
  word: string;
  contextBefore: string;
  contextAfter: string;
  category: string;
}

const LLM_ENABLED = () => process.env.LLM_JUDGE_ENABLED === 'true';
const OLLAMA_HOST = () => process.env.OLLAMA_HOST || 'http://localhost:11434';
const MODEL = () => process.env.LLM_JUDGE_MODEL || 'gemma4:e2b';
const TIMEOUT_MS = () => Number(process.env.LLM_JUDGE_TIMEOUT_MS || 5000);
const MAX_PER_DETECTION = () => Number(process.env.LLM_JUDGE_MAX_PER_DETECTION || 3);
const CONTEXT_WINDOW = 80;

// 极简 LRU：cap=500，TTL=1h，纯内存
interface CacheEntry {
  value: JudgeResult;
  expireAt: number;
}
const cache = new Map<string, CacheEntry>();
const CACHE_CAP = 500;
const CACHE_TTL_MS = 60 * 60 * 1000;

function cacheKey(word: string, ctxBefore: string, ctxAfter: string): string {
  return createHash('sha256')
    .update(`${MODEL()}|${word}|${ctxBefore}|${ctxAfter}`)
    .digest('hex');
}

function getCached(key: string): JudgeResult | undefined {
  const e = cache.get(key);
  if (!e) return undefined;
  if (e.expireAt <= Date.now()) {
    cache.delete(key);
    return undefined;
  }
  // LRU touch
  cache.delete(key);
  cache.set(key, e);
  return e.value;
}

function setCached(key: string, value: JudgeResult) {
  if (cache.size >= CACHE_CAP) {
    const first = cache.keys().next().value;
    if (first !== undefined) cache.delete(first);
  }
  cache.set(key, { value, expireAt: Date.now() + CACHE_TTL_MS });
}

const PROMPT_TEMPLATE = (args: JudgeOptions) =>
  `你是内容安全审核员。判断下面**命中词**在该上下文中是否构成真实的风险信息。\n\n` +
  `规则触发分类：${args.category}\n` +
  `命中词：「${args.word}」\n` +
  `完整上下文：…${args.contextBefore}『${args.word}』${args.contextAfter}…\n\n` +
  `判定原则（按优先级）：\n` +
  `1. 若命中词处于反向劝阻、警示、报道、引用、教育、技术说明等中性语境，判为 neutral / quote / reverse；\n` +
  `2. 若命中词属于游戏术语、专业名词、复合词的一部分（如「攻击力」「赌一把试试」「测试敏感词」），判为 neutral；\n` +
  `3. 仅当文字真实在传播 / 教唆 / 实施风险行为时才判 sensitive；存疑时倾向 neutral。\n\n` +
  `参考示例：\n` +
  `- "这游戏角色攻击力很强" → {"verdict":"neutral","reason":"游戏术语"}\n` +
  `- "请勿沉迷赌博" → {"verdict":"reverse","reason":"反向劝阻"}\n` +
  `- "他说『最近迷上赌博』" → {"verdict":"quote","reason":"引述"}\n` +
  `- "组织线下赌博活动" → {"verdict":"sensitive","reason":"组织违法行为"}\n\n` +
  `只输出 JSON：\n` +
  `{"verdict":"sensitive|neutral|quote|reverse","reason":"一句话理由(20字内)"}`;

export async function judge(args: JudgeOptions): Promise<JudgeResult> {
  const key = cacheKey(args.word, args.contextBefore, args.contextAfter);
  const cached = getCached(key);
  if (cached) return cached;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS());
  try {
    const resp = await fetch(`${OLLAMA_HOST()}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL(),
        prompt: PROMPT_TEMPLATE(args),
        format: 'json',
        stream: false,
        options: { temperature: 0, num_predict: 200 },
      }),
      signal: controller.signal,
    });
    if (!resp.ok) {
      return fallback(`ollama http ${resp.status}`);
    }
    const json = (await resp.json()) as { response?: string };
    if (!json.response) return fallback('empty response');
    const parsed = parseVerdict(json.response);
    if (!parsed) return fallback('json parse failed');
    setCached(key, parsed);
    return parsed;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return fallback(msg);
  } finally {
    clearTimeout(timer);
  }
}

function parseVerdict(raw: string): JudgeResult | null {
  try {
    const obj = JSON.parse(raw);
    const verdict: Verdict | undefined = ['sensitive', 'neutral', 'quote', 'reverse'].includes(obj.verdict)
      ? obj.verdict
      : undefined;
    if (!verdict) return null;
    const reason = typeof obj.reason === 'string' ? obj.reason.slice(0, 100) : '';
    return { verdict, reason };
  } catch {
    return null;
  }
}

function fallback(why: string): JudgeResult {
  return { verdict: 'sensitive', reason: `judge_unavailable(${why})` };
}

/**
 * 对一组 matches 中等置信度命中并发判定，按结果调整 confidence 与 judgeVerdict
 * - 仅作用于 confidence ∈ [0.5, 0.85)
 * - 按 confidence 降序选前 N（默认 3）调 LLM
 * - verdict ∈ {neutral, quote, reverse} → confidence ×= 0.3
 * - verdict = sensitive → confidence = max(原值, 0.9)
 */
export async function judgeUnsure(matches: DetectionMatch[], text: string): Promise<DetectionMatch[]> {
  if (!LLM_ENABLED()) return matches;
  const candidateIdx: number[] = [];
  matches.forEach((m, i) => {
    const c = m.confidence ?? 1;
    if (c >= 0.5 && c < 0.85) candidateIdx.push(i);
  });
  if (!candidateIdx.length) return matches;

  // 按 confidence 降序，取前 N
  candidateIdx.sort((a, b) => (matches[b].confidence ?? 1) - (matches[a].confidence ?? 1));
  const picked = candidateIdx.slice(0, MAX_PER_DETECTION());

  const verdicts = await Promise.all(
    picked.map(async (i) => {
      const m = matches[i];
      const before = text.slice(Math.max(0, m.start - CONTEXT_WINDOW), m.start);
      const after = text.slice(m.end, Math.min(text.length, m.end + CONTEXT_WINDOW));
      return {
        i,
        r: await judge({
          word: m.word,
          contextBefore: before,
          contextAfter: after,
          category: m.category,
        }),
      };
    }),
  );

  const next = [...matches];
  for (const { i, r } of verdicts) {
    const m = next[i];
    const oldConf = m.confidence ?? 1;
    let newConf = oldConf;
    if (r.verdict === 'sensitive') {
      newConf = Math.max(oldConf, 0.9);
    } else {
      newConf = oldConf * 0.3;
    }
    const aiTag = r.reason ? `ai:${r.verdict}(${r.reason})` : `ai:${r.verdict}`;
    next[i] = {
      ...m,
      originalConfidence: oldConf,
      confidence: newConf,
      judgeVerdict: r.verdict,
      reason: m.reason ? `${m.reason} / ${aiTag}` : aiTag,
    };
  }
  return next;
}

export function isLLMEnabled(): boolean {
  return LLM_ENABLED();
}

// 测试辅助：清空缓存（生产代码不应调用）
export function _clearCacheForTest(): void {
  cache.clear();
}
