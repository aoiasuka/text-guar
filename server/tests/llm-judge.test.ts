import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import type { DetectionMatch } from '@text-guard/shared';
import { judgeFullText, judgeUnsure, isLLMEnabled, _clearCacheForTest } from '../src/engine/llm-judge.js';

const origFetch = globalThis.fetch;
const origEnv = { ...process.env };

function restoreEnv() {
  for (const k of Object.keys(process.env)) delete process.env[k];
  Object.assign(process.env, origEnv);
}

function mkMatch(confidence: number, overrides: Partial<DetectionMatch> = {}): DetectionMatch {
  return {
    type: 'word',
    word: '赌博',
    riskLevel: 'high',
    category: '违规',
    replacement: '***',
    start: 0,
    end: 2,
    source: 'literal',
    confidence,
    ...overrides,
  };
}

describe('LLM 兜底 · Ollama HTTP API', () => {
  after(() => {
    globalThis.fetch = origFetch;
    restoreEnv();
  });

  beforeEach(() => {
    restoreEnv();
    _clearCacheForTest();
  });

  it('LLM_JUDGE_ENABLED=false 时不调 fetch、不改 matches', async () => {
    process.env.LLM_JUDGE_ENABLED = 'false';
    let called = 0;
    globalThis.fetch = (async () => {
      called += 1;
      return new Response('{}', { status: 200 });
    }) as typeof fetch;
    assert.equal(isLLMEnabled(), false);

    const input = [mkMatch(0.6)];
    const out = await judgeUnsure(input, '他在赌博');
    assert.equal(called, 0);
    assert.equal(out[0].confidence, 0.6);
    assert.equal(out[0].judgeVerdict, undefined);
  });

  it('LLM 启用且 verdict=quote 时把 confidence ×= 0.3', async () => {
    process.env.LLM_JUDGE_ENABLED = 'true';
    process.env.LLM_JUDGE_MODEL = 'gemma4:e2b';
    const calls: any[] = [];
    globalThis.fetch = (async (_url: any, init: any) => {
      calls.push(JSON.parse(String(init.body)));
      return new Response(
        JSON.stringify({ response: JSON.stringify({ verdict: 'quote', reason: '引用' }) }),
        { status: 200 },
      );
    }) as typeof fetch;

    const input = [mkMatch(0.6, { word: '赌博', start: 3, end: 5 })];
    const out = await judgeUnsure(input, '他说"赌博"是坏事');

    assert.equal(calls.length, 1);
    assert.equal(calls[0].model, 'gemma4:e2b');
    assert.equal(calls[0].format, 'json');
    assert.equal(calls[0].options.temperature, 0);
    assert.ok(Math.abs((out[0].confidence ?? 0) - 0.18) < 0.001, `期望 0.6×0.3=0.18，实际 ${out[0].confidence}`);
    assert.equal(out[0].judgeVerdict, 'quote');
    assert.match(out[0].reason ?? '', /ai:quote/);
  });

  it('LLM verdict=sensitive 时把 confidence 拉到 ≥0.9', async () => {
    process.env.LLM_JUDGE_ENABLED = 'true';
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({ response: JSON.stringify({ verdict: 'sensitive', reason: '确实涉赌' }) }),
        { status: 200 },
      )) as typeof fetch;

    const out = await judgeUnsure([mkMatch(0.6)], '他在赌博');
    assert.ok((out[0].confidence ?? 0) >= 0.9);
    assert.equal(out[0].judgeVerdict, 'sensitive');
  });

  it('Ollama 不可达时不改写命中（保留规则原始置信度，仅在 reason 标记失败）', async () => {
    process.env.LLM_JUDGE_ENABLED = 'true';
    globalThis.fetch = (async () => {
      throw new Error('ECONNREFUSED');
    }) as typeof fetch;

    const out = await judgeUnsure([mkMatch(0.6)], '他在赌博');
    assert.equal(out[0].confidence, 0.6, '失败时不应改写置信度');
    assert.equal(out[0].judgeVerdict, undefined, '失败时不应设 judgeVerdict');
    assert.equal(out[0].originalConfidence, undefined, '失败时不应记 originalConfidence');
    assert.match(out[0].reason ?? '', /judge_failed.*ECONNREFUSED/);
  });

  it('confidence >= 0.85 的高置信度命中也会被复核（全量模式）', async () => {
    process.env.LLM_JUDGE_ENABLED = 'true';
    let called = 0;
    globalThis.fetch = (async () => {
      called += 1;
      return new Response(
        JSON.stringify({ response: JSON.stringify({ verdict: 'sensitive', reason: '确实是风险' }) }),
        { status: 200 },
      );
    }) as typeof fetch;

    await judgeUnsure([mkMatch(0.9)], '他在赌博');
    assert.equal(called, 1, '全量模式下高置信度命中也应被复核');
  });

  it('confidence < 0.5 的命中不会出现在 judgeUnsure 入参（已被规则层过滤）', async () => {
    // 此场景实际由 detector.detect 内部的 CONFIDENCE_DROP_BELOW 过滤；
    // judgeUnsure 假设入参全部 ≥ 0.5。若调用方传入低置信度，仍会照常调（不再人为屏蔽）
    process.env.LLM_JUDGE_ENABLED = 'true';
    let called = 0;
    globalThis.fetch = (async () => {
      called += 1;
      return new Response('{"response":"{\\"verdict\\":\\"neutral\\",\\"reason\\":\\"low\\"}"}', { status: 200 });
    }) as typeof fetch;

    await judgeUnsure([mkMatch(0.3)], '他在赌博');
    assert.equal(called, 1, 'judgeUnsure 不再过滤入参，全部命中都调');
  });
});

describe('judgeFullText · AI 全文兜底', () => {
  after(() => {
    globalThis.fetch = origFetch;
    restoreEnv();
  });

  beforeEach(() => {
    restoreEnv();
    _clearCacheForTest();
  });

  it('LLM 未启用时直接返回 null（不调 fetch）', async () => {
    process.env.LLM_JUDGE_ENABLED = 'false';
    let called = 0;
    globalThis.fetch = (async () => {
      called += 1;
      return new Response('{}', { status: 200 });
    }) as typeof fetch;

    const r = await judgeFullText('傻逼操你妈');
    assert.equal(r, null);
    assert.equal(called, 0);
  });

  it('verdict=sensitive 时返回 source=llm 的 DetectionMatch', async () => {
    process.env.LLM_JUDGE_ENABLED = 'true';
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          response: JSON.stringify({
            verdict: 'sensitive',
            riskLevel: 'high',
            category: '辱骂',
            span: '傻逼',
            reason: '人身攻击',
          }),
        }),
        { status: 200 },
      )) as typeof fetch;

    const r = await judgeFullText('傻逼，操你妈');
    assert.ok(r, '应生成命中');
    assert.equal(r?.source, 'llm');
    assert.equal(r?.riskLevel, 'high');
    assert.equal(r?.judgeVerdict, 'sensitive');
    assert.match(r?.category ?? '', /AI:辱骂/);
    assert.equal(r?.word, '傻逼');
    assert.equal(r?.start, 0);
    assert.equal(r?.end, 2);
  });

  it('verdict=neutral 时返回 null', async () => {
    process.env.LLM_JUDGE_ENABLED = 'true';
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          response: JSON.stringify({
            verdict: 'neutral',
            riskLevel: 'low',
            category: '中性',
            span: '',
            reason: '日常对话',
          }),
        }),
        { status: 200 },
      )) as typeof fetch;

    const r = await judgeFullText('今天天气真好');
    assert.equal(r, null);
  });

  it('span 在原文找不到时降级用片段', async () => {
    process.env.LLM_JUDGE_ENABLED = 'true';
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          response: JSON.stringify({
            verdict: 'sensitive',
            riskLevel: 'medium',
            category: '违规',
            span: '不在原文里的内容',
            reason: '...',
          }),
        }),
        { status: 200 },
      )) as typeof fetch;

    const r = await judgeFullText('原文内容很短');
    assert.ok(r);
    assert.ok(r?.word.length);
  });

  it('Ollama 不可达时返回 null（不污染主流程）', async () => {
    process.env.LLM_JUDGE_ENABLED = 'true';
    globalThis.fetch = (async () => {
      throw new Error('ECONNREFUSED');
    }) as typeof fetch;

    const r = await judgeFullText('傻逼');
    assert.equal(r, null);
  });

  it('catalog 参数被注入到 prompt（让 AI 感知项目敏感词类别）', async () => {
    process.env.LLM_JUDGE_ENABLED = 'true';
    let captured: any = null;
    globalThis.fetch = (async (_url: any, init: any) => {
      captured = JSON.parse(String(init.body));
      return new Response(
        JSON.stringify({
          response: JSON.stringify({ verdict: 'neutral', riskLevel: 'low', category: '中性', span: '', reason: 'n' }),
        }),
        { status: 200 },
      );
    }) as typeof fetch;

    await judgeFullText('一段广告软文', {
      营销: ['推广', '广告'],
      违规: ['赌博', '诈骗'],
    });

    assert.ok(captured, 'fetch 应被调用');
    const prompt = String(captured.prompt);
    assert.match(prompt, /项目敏感词库摘要/);
    assert.match(prompt, /营销.*推广|推广.*广告/);
    assert.match(prompt, /违规.*赌博|赌博.*诈骗/);
  });
});
