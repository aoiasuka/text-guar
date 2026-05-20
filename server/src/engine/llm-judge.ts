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
  /** 是否为 fallback（网络/超时/解析失败时为 true）。failed 时不应改写 confidence。 */
  failed?: boolean;
}

interface JudgeOptions {
  word: string;
  contextBefore: string;
  contextAfter: string;
  category: string;
}

/** 业务敏感词库摘要：category → 示例词列表，注入到 prompt 让 AI 感知项目关注的风险类别 */
export type CategoryCatalog = Record<string, string[]>;

function buildCatalogBlock(catalog?: CategoryCatalog): string {
  if (!catalog || Object.keys(catalog).length === 0) return '';
  const lines = Object.entries(catalog)
    .filter(([, words]) => words.length > 0)
    .map(([cat, words]) => `  · ${cat}：${words.slice(0, 6).join('、')}`);
  if (lines.length === 0) return '';
  return `\n\n项目敏感词库摘要（业务关注的风险类别，仅作判定参考，不要求逐字匹配）：\n${lines.join('\n')}`;
}

function hashCatalog(catalog?: CategoryCatalog): string {
  if (!catalog || Object.keys(catalog).length === 0) return 'nocatalog';
  const stable = Object.keys(catalog)
    .sort()
    .map((k) => `${k}:${catalog[k].slice().sort().join(',')}`)
    .join('|');
  return createHash('sha256').update(stable).digest('hex').slice(0, 16);
}

export interface JudgeTrace {
  word: string;
  category: string;
  durationMs: number;
  fromCache: boolean;
  ok: boolean;
  verdict?: Verdict;
  reason?: string;
  errorMessage?: string;
  httpStatus?: number;
  promptPreview: string;
  rawResponse?: string;
}

// 当前请求的 trace 收集器（thread-local 风格，靠 AsyncLocalStorage 太重；演示项目用简单全局 + opt-in）
let currentTraces: JudgeTrace[] | null = null;

export function withTraceCollection<T>(fn: () => Promise<T>): Promise<{ value: T; traces: JudgeTrace[] }> {
  const collected: JudgeTrace[] = [];
  const previous = currentTraces;
  currentTraces = collected;
  return fn()
    .then((value) => ({ value, traces: collected }))
    .finally(() => {
      currentTraces = previous;
    });
}

const LLM_ENABLED = () => process.env.LLM_JUDGE_ENABLED === 'true';
const OLLAMA_HOST = () => process.env.OLLAMA_HOST || 'http://localhost:11434';
const MODEL = () => process.env.LLM_JUDGE_MODEL || 'gemma4:e2b';
const TIMEOUT_MS = () => Number(process.env.LLM_JUDGE_TIMEOUT_MS || 30000);
const MAX_PER_DETECTION = () => Number(process.env.LLM_JUDGE_MAX_PER_DETECTION || 10);
const CONTEXT_WINDOW = 80;

interface CacheEntry {
  value: JudgeResult;
  expireAt: number;
}
const cache = new Map<string, CacheEntry>();
const CACHE_CAP = 500;
const CACHE_TTL_MS = 60 * 60 * 1000;

function cacheKey(word: string, ctxBefore: string, ctxAfter: string, catalogHash: string): string {
  return createHash('sha256')
    .update(`${MODEL()}|${catalogHash}|${word}|${ctxBefore}|${ctxAfter}`)
    .digest('hex');
}

function getCached(key: string): JudgeResult | undefined {
  const e = cache.get(key);
  if (!e) return undefined;
  if (e.expireAt <= Date.now()) {
    cache.delete(key);
    return undefined;
  }
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

const PROMPT_TEMPLATE = (args: JudgeOptions, catalog?: CategoryCatalog) =>
  `你是内容安全审核员。判断下面**命中词**在该上下文中是否构成真实的风险信息。\n\n` +
  `规则触发分类：${args.category}\n` +
  `命中词：「${args.word}」\n` +
  `完整上下文：…${args.contextBefore}『${args.word}』${args.contextAfter}…${buildCatalogBlock(catalog)}\n\n` +
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

function logInfo(msg: string, meta?: Record<string, unknown>) {
  // 演示项目直接打 console，方便排查；生产可换 pino/winston
  const tail = meta ? ` ${JSON.stringify(meta)}` : '';
  console.log(`[llm-judge] ${msg}${tail}`);
}

function logWarn(msg: string, meta?: Record<string, unknown>) {
  const tail = meta ? ` ${JSON.stringify(meta)}` : '';
  console.warn(`[llm-judge] ${msg}${tail}`);
}

export async function judge(args: JudgeOptions, catalog?: CategoryCatalog): Promise<JudgeResult> {
  const t0 = Date.now();
  const catalogHash = hashCatalog(catalog);
  const key = cacheKey(args.word, args.contextBefore, args.contextAfter, catalogHash);
  const promptPreview = `…${args.contextBefore.slice(-30)}『${args.word}』${args.contextAfter.slice(0, 30)}…`;

  const cached = getCached(key);
  if (cached) {
    logInfo(`cache HIT word="${args.word}" → ${cached.verdict}`);
    currentTraces?.push({
      word: args.word,
      category: args.category,
      durationMs: 0,
      fromCache: true,
      ok: true,
      verdict: cached.verdict,
      reason: cached.reason,
      promptPreview,
    });
    return cached;
  }

  logInfo(`→ ollama POST /api/generate word="${args.word}" category="${args.category}" model="${MODEL()}"`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS());
  let resp: Response;
  try {
    resp = await fetch(`${OLLAMA_HOST()}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL(),
        prompt: PROMPT_TEMPLATE(args, catalog),
        format: 'json',
        stream: false,
        options: { temperature: 0, num_predict: 200 },
      }),
      signal: controller.signal,
    });
  } catch (error) {
    const durationMs = Date.now() - t0;
    const msg = error instanceof Error ? error.message : String(error);
    logWarn(`✗ ollama 调用失败 word="${args.word}" duration=${durationMs}ms reason="${msg}"`);
    const r = fallback(msg);
    currentTraces?.push({
      word: args.word,
      category: args.category,
      durationMs,
      fromCache: false,
      ok: false,
      verdict: r.verdict,
      reason: r.reason,
      errorMessage: msg,
      promptPreview,
    });
    clearTimeout(timer);
    return r;
  } finally {
    clearTimeout(timer);
  }

  if (!resp.ok) {
    const durationMs = Date.now() - t0;
    logWarn(`✗ ollama http ${resp.status} word="${args.word}" duration=${durationMs}ms`);
    const r = fallback(`ollama http ${resp.status}`);
    currentTraces?.push({
      word: args.word,
      category: args.category,
      durationMs,
      fromCache: false,
      ok: false,
      verdict: r.verdict,
      reason: r.reason,
      errorMessage: `http ${resp.status}`,
      httpStatus: resp.status,
      promptPreview,
    });
    return r;
  }

  let json: { response?: string };
  try {
    json = (await resp.json()) as { response?: string };
  } catch (error) {
    const durationMs = Date.now() - t0;
    const msg = error instanceof Error ? error.message : String(error);
    logWarn(`✗ ollama response 非 JSON word="${args.word}" duration=${durationMs}ms reason="${msg}"`);
    const r = fallback(`response not json: ${msg}`);
    currentTraces?.push({
      word: args.word,
      category: args.category,
      durationMs,
      fromCache: false,
      ok: false,
      verdict: r.verdict,
      reason: r.reason,
      errorMessage: msg,
      httpStatus: resp.status,
      promptPreview,
    });
    return r;
  }

  const rawResponse = json.response ?? '';
  const parsed = parseVerdict(rawResponse);
  const durationMs = Date.now() - t0;

  if (!parsed) {
    logWarn(`✗ ollama 响应解析失败 word="${args.word}" duration=${durationMs}ms raw=${JSON.stringify(rawResponse).slice(0, 200)}`);
    const r = fallback('json parse failed');
    currentTraces?.push({
      word: args.word,
      category: args.category,
      durationMs,
      fromCache: false,
      ok: false,
      verdict: r.verdict,
      reason: r.reason,
      errorMessage: 'json parse failed',
      httpStatus: resp.status,
      rawResponse: rawResponse.slice(0, 500),
      promptPreview,
    });
    return r;
  }

  logInfo(`✓ word="${args.word}" → ${parsed.verdict} duration=${durationMs}ms reason="${parsed.reason}"`);
  setCached(key, parsed);
  currentTraces?.push({
    word: args.word,
    category: args.category,
    durationMs,
    fromCache: false,
    ok: true,
    verdict: parsed.verdict,
    reason: parsed.reason,
    httpStatus: resp.status,
    rawResponse: rawResponse.slice(0, 500),
    promptPreview,
  });
  return parsed;
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
  // verdict 字段仅为类型兼容；judgeUnsure 检测到 failed=true 时会跳过任何 confidence 改写
  return { verdict: 'sensitive', reason: `judge_unavailable(${why})`, failed: true };
}

export async function judgeUnsure(
  matches: DetectionMatch[],
  text: string,
  catalog?: CategoryCatalog,
): Promise<DetectionMatch[]> {
  if (!LLM_ENABLED()) return matches;
  // 对所有命中（confidence ≥ 0.5，即未被规则层丢弃的）都调 AI 复核
  // 低置信度命中已经被 detector.detect 内部的 CONFIDENCE_DROP_BELOW 过滤掉，到这里的全是有效命中
  const candidateIdx: number[] = matches.map((_, i) => i);
  if (!candidateIdx.length) {
    logInfo(`judgeUnsure: 无命中跳过`);
    return matches;
  }

  // 按 confidence 降序，命中数超过上限时优先复核最高的（更可能误判 sensitive 需要 AI 把关）
  candidateIdx.sort((a, b) => (matches[b].confidence ?? 1) - (matches[a].confidence ?? 1));
  const picked = candidateIdx.slice(0, MAX_PER_DETECTION());
  logInfo(`judgeUnsure: 准备调 LLM ${picked.length} 次（命中总数 ${matches.length}，上限 ${MAX_PER_DETECTION()}）`);

  const verdicts = await Promise.all(
    picked.map(async (i) => {
      const m = matches[i];
      const before = text.slice(Math.max(0, m.start - CONTEXT_WINDOW), m.start);
      const after = text.slice(m.end, Math.min(text.length, m.end + CONTEXT_WINDOW));
      return {
        i,
        r: await judge(
          {
            word: m.word,
            contextBefore: before,
            contextAfter: after,
            category: m.category,
          },
          catalog,
        ),
      };
    }),
  );

  const next = [...matches];
  for (const { i, r } of verdicts) {
    const m = next[i];
    const oldConf = m.confidence ?? 1;

    // 失败 / 超时 / 解析错：不改写置信度，仅在 reason 标记本次判定未生效，让规则原始结论保持
    if (r.failed) {
      next[i] = {
        ...m,
        reason: m.reason ? `${m.reason} / judge_failed(${r.reason})` : `judge_failed(${r.reason})`,
      };
      continue;
    }

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

// =============================================================================
// judgeFullText：整段文本独立判定（用于规则零命中时的 AI 兜底）
// =============================================================================

export interface FullTextVerdict {
  verdict: 'sensitive' | 'neutral';
  riskLevel: 'low' | 'medium' | 'high';
  category: string;
  span: string;
  reason: string;
}

const FULLTEXT_PROMPT = (text: string, catalog?: CategoryCatalog) =>
  `你是内容安全审核员。判断下面整段文本是否含真实的风险信息。\n\n` +
  `候选风险类别：辱骂、暴力、色情、政治敏感、违法、凭证泄漏、广告营销、垃圾信息、隐私泄漏。${buildCatalogBlock(catalog)}\n\n` +
  `判定原则：\n` +
  `1. 反向劝阻、教育、报道、引用等中性语境 → neutral；\n` +
  `2. 真实在传播、教唆、实施风险行为 → sensitive；\n` +
  `3. 优先匹配上方"项目敏感词库摘要"中的业务关注类别（如广告营销/凭证泄漏等隐性风险）；\n` +
  `4. 存疑时倾向 neutral。\n\n` +
  `待检测文本：\n"${text}"\n\n` +
  `只输出 JSON：\n` +
  `{"verdict":"sensitive|neutral","riskLevel":"low|medium|high","category":"具体类别(不超过10字)","span":"风险片段原文(若无则空串)","reason":"一句话理由(20字内)"}`;

const fullTextCache = new Map<string, CacheEntry>();
const FULLTEXT_CACHE_CAP = 200;

function fullTextCacheKey(text: string, catalogHash: string): string {
  return createHash('sha256').update(`${MODEL()}|fulltext|${catalogHash}|${text}`).digest('hex');
}

function getFullTextCached(key: string): FullTextVerdict | undefined {
  const e = fullTextCache.get(key);
  if (!e) return undefined;
  if (e.expireAt <= Date.now()) {
    fullTextCache.delete(key);
    return undefined;
  }
  fullTextCache.delete(key);
  fullTextCache.set(key, e);
  return e.value as unknown as FullTextVerdict;
}

function setFullTextCached(key: string, value: FullTextVerdict) {
  if (fullTextCache.size >= FULLTEXT_CACHE_CAP) {
    const first = fullTextCache.keys().next().value;
    if (first !== undefined) fullTextCache.delete(first);
  }
  fullTextCache.set(key, {
    value: value as unknown as JudgeResult,
    expireAt: Date.now() + CACHE_TTL_MS,
  });
}

function parseFullTextVerdict(raw: string): FullTextVerdict | null {
  try {
    const obj = JSON.parse(raw);
    if (obj.verdict !== 'sensitive' && obj.verdict !== 'neutral') return null;
    return {
      verdict: obj.verdict,
      riskLevel: ['low', 'medium', 'high'].includes(obj.riskLevel) ? obj.riskLevel : 'medium',
      category: typeof obj.category === 'string' ? obj.category.slice(0, 20) : '风险',
      span: typeof obj.span === 'string' ? obj.span : '',
      reason: typeof obj.reason === 'string' ? obj.reason.slice(0, 100) : '',
    };
  } catch {
    return null;
  }
}

/**
 * 整段文本独立判定
 * - 返回 null = 判 neutral 或调用失败（保守按"无风险"处理，不向结果注入命中）
 * - 返回 DetectionMatch = 判 sensitive 且能定位 span，作为一条 source='llm' 的命中加入结果
 */
export async function judgeFullText(text: string, catalog?: CategoryCatalog): Promise<DetectionMatch | null> {
  if (!LLM_ENABLED()) return null;
  const t0 = Date.now();
  const catalogHash = hashCatalog(catalog);
  const key = fullTextCacheKey(text, catalogHash);
  const promptPreview = `[全文判定] ${text.slice(0, 80)}${text.length > 80 ? '…' : ''}`;

  const cached = getFullTextCached(key);
  if (cached) {
    logInfo(`fulltext cache HIT → ${cached.verdict}`);
    currentTraces?.push({
      word: '[整段文本]',
      category: 'AI 全文兜底',
      durationMs: 0,
      fromCache: true,
      ok: true,
      verdict: cached.verdict,
      reason: cached.reason,
      promptPreview,
    });
    return buildMatchFromFullText(text, cached);
  }

  logInfo(`→ ollama 全文判定 length=${text.length} model="${MODEL()}"`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS());
  let resp: Response;
  try {
    resp = await fetch(`${OLLAMA_HOST()}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL(),
        prompt: FULLTEXT_PROMPT(text, catalog),
        format: 'json',
        stream: false,
        options: { temperature: 0, num_predict: 300 },
      }),
      signal: controller.signal,
    });
  } catch (error) {
    const durationMs = Date.now() - t0;
    const msg = error instanceof Error ? error.message : String(error);
    logWarn(`✗ 全文判定失败 duration=${durationMs}ms reason="${msg}"`);
    currentTraces?.push({
      word: '[整段文本]',
      category: 'AI 全文兜底',
      durationMs,
      fromCache: false,
      ok: false,
      errorMessage: msg,
      promptPreview,
    });
    clearTimeout(timer);
    return null;
  } finally {
    clearTimeout(timer);
  }

  if (!resp.ok) {
    const durationMs = Date.now() - t0;
    logWarn(`✗ 全文判定 http ${resp.status} duration=${durationMs}ms`);
    currentTraces?.push({
      word: '[整段文本]',
      category: 'AI 全文兜底',
      durationMs,
      fromCache: false,
      ok: false,
      errorMessage: `http ${resp.status}`,
      httpStatus: resp.status,
      promptPreview,
    });
    return null;
  }

  let json: { response?: string };
  try {
    json = (await resp.json()) as { response?: string };
  } catch (error) {
    const durationMs = Date.now() - t0;
    const msg = error instanceof Error ? error.message : String(error);
    logWarn(`✗ 全文判定响应非 JSON duration=${durationMs}ms reason="${msg}"`);
    currentTraces?.push({
      word: '[整段文本]',
      category: 'AI 全文兜底',
      durationMs,
      fromCache: false,
      ok: false,
      errorMessage: msg,
      httpStatus: resp.status,
      promptPreview,
    });
    return null;
  }

  const rawResponse = json.response ?? '';
  const parsed = parseFullTextVerdict(rawResponse);
  const durationMs = Date.now() - t0;

  if (!parsed) {
    logWarn(`✗ 全文判定解析失败 duration=${durationMs}ms raw=${JSON.stringify(rawResponse).slice(0, 200)}`);
    currentTraces?.push({
      word: '[整段文本]',
      category: 'AI 全文兜底',
      durationMs,
      fromCache: false,
      ok: false,
      errorMessage: 'json parse failed',
      httpStatus: resp.status,
      rawResponse: rawResponse.slice(0, 500),
      promptPreview,
    });
    return null;
  }

  logInfo(`✓ 全文判定 → ${parsed.verdict} (${parsed.category}) duration=${durationMs}ms reason="${parsed.reason}"`);
  setFullTextCached(key, parsed);
  currentTraces?.push({
    word: '[整段文本]',
    category: 'AI 全文兜底',
    durationMs,
    fromCache: false,
    ok: true,
    verdict: parsed.verdict,
    reason: parsed.reason,
    httpStatus: resp.status,
    rawResponse: rawResponse.slice(0, 500),
    promptPreview,
  });
  return buildMatchFromFullText(text, parsed);
}

function buildMatchFromFullText(text: string, v: FullTextVerdict): DetectionMatch | null {
  if (v.verdict !== 'sensitive') return null;
  // 用 span 定位原文位置；定位不到时降级到全文起始
  let start = 0;
  let end = Math.min(text.length, 120);
  let word = text.slice(0, end);
  if (v.span && v.span.trim()) {
    const idx = text.indexOf(v.span);
    if (idx >= 0) {
      start = idx;
      end = idx + v.span.length;
      word = v.span;
    } else {
      word = v.span.slice(0, 120);
    }
  }
  return {
    type: 'word',
    word,
    riskLevel: v.riskLevel,
    category: `AI:${v.category}`,
    replacement: '[AI风险]',
    start,
    end,
    source: 'llm',
    confidence: 0.85,
    judgeVerdict: 'sensitive',
    reason: `ai_full_text:${v.reason}`,
  };
}

// 测试辅助：清空缓存（生产代码不应调用）
export function _clearCacheForTest(): void {
  cache.clear();
  fullTextCache.clear();
}
export interface LLMHealth {
  enabled: boolean;
  host: string;
  model: string;
  reachable: boolean;
  modelInstalled: boolean;
  availableModels: string[];
  latencyMs: number;
  error?: string;
}

export async function checkHealth(): Promise<LLMHealth> {
  const host = OLLAMA_HOST();
  const model = MODEL();
  const t0 = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const resp = await fetch(`${host}/api/tags`, { signal: controller.signal });
    const latencyMs = Date.now() - t0;
    if (!resp.ok) {
      return {
        enabled: LLM_ENABLED(),
        host,
        model,
        reachable: false,
        modelInstalled: false,
        availableModels: [],
        latencyMs,
        error: `ollama /api/tags returned http ${resp.status}`,
      };
    }
    const data = (await resp.json()) as { models?: Array<{ name: string }> };
    const available = (data.models ?? []).map((m) => m.name);
    return {
      enabled: LLM_ENABLED(),
      host,
      model,
      reachable: true,
      modelInstalled: available.includes(model),
      availableModels: available,
      latencyMs,
    };
  } catch (error) {
    return {
      enabled: LLM_ENABLED(),
      host,
      model,
      reachable: false,
      modelInstalled: false,
      availableModels: [],
      latencyMs: Date.now() - t0,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}
