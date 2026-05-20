import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { SensitiveDetector } from '../src/engine/detector.js';

function build() {
  const d = new SensitiveDetector();
  d.rebuild([
    { word: '赌博', riskLevel: 'high', replacement: '[赌博]', category: '违规' },
    { word: '攻击', riskLevel: 'high', replacement: '***', category: '安全' },
  ]);
  return d;
}

describe('SensitiveDetector · 反绕过变体', () => {
  it('命中字面赌博', () => {
    const r = build().detect('他在赌博');
    const hit = r.matches.find((m) => m.word === '赌博');
    assert.ok(hit, '应命中字面赌博');
    assert.equal(hit?.source, 'literal');
    assert.equal(hit?.confidence, 1);
  });

  it('命中拼音 dubo（全拼）', () => {
    const r = build().detect('他在dubo');
    const hit = r.matches.find((m) => m.source === 'literal_variant');
    assert.ok(hit, '应通过拼音变体命中');
    assert.ok((hit?.confidence ?? 0) <= 0.8 && (hit?.confidence ?? 0) >= 0.6);
  });

  it('命中带噪声符号「赌·博 / 赌@博 / 赌_博」', () => {
    const cases = ['他在赌·博', '他在赌@博', '他在赌_博', '他在赌 博'];
    for (const text of cases) {
      const r = build().detect(text);
      const hit = r.matches.find((m) => m.source === 'literal_variant');
      assert.ok(hit, `应命中变体: ${text}`);
    }
  });

  it('命中零宽干扰「赌\\u200b博」（normalize 阶段已剔除）', () => {
    const zws = String.fromCharCode(0x200b);
    const r = build().detect(`他在赌${zws}博`);
    const hit = r.matches.find((m) => m.word.includes('赌'));
    assert.ok(hit);
  });

  it('命中形近字「攴击 → 攻击」', () => {
    const r = build().detect('他想攴击别人');
    const hit = r.matches.find((m) => m.source === 'literal_variant');
    assert.ok(hit, '应通过形近字变体命中攻击');
  });

  it('普通文本「赌徒」不应命中赌博', () => {
    const r = build().detect('他是赌徒');
    assert.equal(r.matches.length, 0);
  });

  it('普通文本「攻克」不应命中攻击', () => {
    const r = build().detect('我们攻克难题');
    assert.equal(r.matches.length, 0);
  });

  it('variantMatch=false 时关闭拼音/形近变体', () => {
    const d = new SensitiveDetector();
    d.rebuild([
      { word: '赌博', riskLevel: 'high', replacement: '[赌博]', category: '违规', variantMatch: false },
    ]);
    const r = d.detect('他在dubo');
    assert.equal(r.matches.length, 0, '关闭变体后 dubo 不应命中');
  });

  it('字面命中与变体命中重叠时合并为高置信度', () => {
    const r = build().detect('他在赌博');
    assert.equal(r.matches.length, 1);
    const conf = r.matches[0].confidence ?? 0;
    assert.equal(conf, 1, '合并后应保留字面命中的高置信度');
  });
});
