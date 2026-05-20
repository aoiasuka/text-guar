import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import type { DetectionMatch } from '@text-guard/shared';
import { judgeUnsure, isLLMEnabled, _clearCacheForTest } from '../src/engine/llm-judge.js';

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

  it('Ollama 不可达时 fallback verdict=sensitive，confidence ≥0.9', async () => {
    process.env.LLM_JUDGE_ENABLED = 'true';
    globalThis.fetch = (async () => {
      throw new Error('ECONNREFUSED');
    }) as typeof fetch;

    const out = await judgeUnsure([mkMatch(0.6)], '他在赌博');
    assert.ok((out[0].confidence ?? 0) >= 0.9, '判定失败时保守拉高');
    assert.equal(out[0].judgeVerdict, 'sensitive');
    assert.match(out[0].reason ?? '', /judge_unavailable/);
  });

  it('confidence >= 0.85 的高置信度命中不触发 LLM', async () => {
    process.env.LLM_JUDGE_ENABLED = 'true';
    let called = 0;
    globalThis.fetch = (async () => {
      called += 1;
      return new Response('{"response":"{}"}', { status: 200 });
    }) as typeof fetch;

    await judgeUnsure([mkMatch(0.9)], '他在赌博');
    assert.equal(called, 0, '高置信度直接放过不调 LLM');
  });

  it('confidence < 0.5 的低置信度也不调（已被主流程过滤）', async () => {
    process.env.LLM_JUDGE_ENABLED = 'true';
    let called = 0;
    globalThis.fetch = (async () => {
      called += 1;
      return new Response('{"response":"{}"}', { status: 200 });
    }) as typeof fetch;

    await judgeUnsure([mkMatch(0.3)], '他在赌博');
    assert.equal(called, 0);
  });
});
