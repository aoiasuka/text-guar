import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { SensitiveDetector } from '../src/engine/detector.js';

function buildBasic() {
  const d = new SensitiveDetector();
  d.rebuild([
    { word: '赌博', riskLevel: 'high', replacement: '[赌博]', category: '违规' },
    { word: '攻击', riskLevel: 'high', replacement: '***', category: '安全' },
    { word: '泄密', riskLevel: 'high', replacement: '[泄密]', category: '安全' },
  ]);
  return d;
}

describe('SensitiveDetector · 上下文消歧', () => {
  it('「攻击力」（jieba 复合词）应被降权丢弃', () => {
    const r = buildBasic().detect('他的攻击力很强');
    // 复合词降权 0.5，confidence=0.5 不被丢弃但临界；这里允许通过或丢弃，关键是不应保留 100% 命中
    const hit = r.matches.find((m) => m.word.includes('攻击'));
    if (hit) {
      assert.ok((hit.confidence ?? 1) < 1, `复合词命中应降权，实际 confidence=${hit.confidence}`);
      assert.match(hit.reason || '', /compound_token/);
    }
  });

  it('引号内的命中应被降权（quoted）', () => {
    const r = buildBasic().detect('他说"赌博"是坏事');
    const hit = r.matches.find((m) => m.word === '赌博');
    if (hit) {
      assert.match(hit.reason || '', /quoted/);
      assert.ok((hit.confidence ?? 1) <= 0.5);
    }
  });

  it('代码块内的命中应被强降权（code）', () => {
    const r = buildBasic().detect('```\n这里有赌博\n```');
    const hit = r.matches.find((m) => m.word === '赌博');
    // 0.3 倍折扣 → 0.3，应被丢弃
    assert.equal(r.matches.filter((m) => m.word === '赌博').length, 0, '代码块内命中应被丢弃');
  });

  it('反向劝阻应被降权', () => {
    const r = buildBasic().detect('请勿赌博');
    const hit = r.matches.find((m) => m.word === '赌博');
    if (hit) {
      assert.match(hit.reason || '', /reverse/);
    }
  });

  it('同类多命中应被加权（cluster）', () => {
    const r = buildBasic().detect('攻击和泄密都很严重');
    const cluster = r.matches.find((m) => /cluster/.test(m.reason || ''));
    assert.ok(cluster, '同 category=安全 应触发 cluster 加成');
  });

  it('contextScope=global 时跳过所有上下文规则', () => {
    const d = new SensitiveDetector();
    d.rebuild([
      { word: '赌博', riskLevel: 'high', replacement: '[赌博]', category: '违规', contextScope: 'global' },
    ]);
    const r = d.detect('请勿"赌博"');
    const hit = r.matches.find((m) => m.word === '赌博');
    assert.ok(hit);
    assert.equal(hit?.confidence, 1, 'global scope 下不应降权');
  });
});
