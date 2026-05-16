import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { getFilterStrategy, getRiskLevel, riskWeight } from '../src/engine/risk-scorer.js';

describe('risk-scorer', () => {
  it('classifies scores into risk levels by thresholds', () => {
    assert.equal(getRiskLevel(0), 'low');
    assert.equal(getRiskLevel(29), 'low');
    assert.equal(getRiskLevel(30), 'medium');
    assert.equal(getRiskLevel(59), 'medium');
    assert.equal(getRiskLevel(60), 'high');
    assert.equal(getRiskLevel(200), 'high');
  });

  it('maps scores to filter strategies', () => {
    assert.equal(getFilterStrategy(0), 'replace');
    assert.equal(getFilterStrategy(30), 'warn');
    assert.equal(getFilterStrategy(60), 'reject');
  });

  it('keeps weight ordering low < medium < high', () => {
    assert.ok(riskWeight.low < riskWeight.medium);
    assert.ok(riskWeight.medium < riskWeight.high);
  });
});
