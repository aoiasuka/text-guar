import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import type { DetectionMatch } from '@text-guard/shared';
import { mergeOverlapping, SensitiveDetector } from '../src/engine/detector.js';

describe('mergeOverlapping', () => {
  it('keeps non-overlapping matches intact', () => {
    const matches: DetectionMatch[] = [
      { type: 'word', word: 'a', riskLevel: 'low', category: 'x', replacement: '***', start: 0, end: 1 },
      { type: 'word', word: 'b', riskLevel: 'low', category: 'x', replacement: '***', start: 5, end: 6 },
    ];
    assert.equal(mergeOverlapping(matches).length, 2);
  });

  it('prefers higher-risk match on overlap', () => {
    const matches: DetectionMatch[] = [
      { type: 'word', word: 'abc', riskLevel: 'low', category: 'x', replacement: '***', start: 0, end: 3 },
      { type: 'regex', word: 'abc', riskLevel: 'high', category: 'y', replacement: '***', start: 0, end: 3 },
    ];
    const merged = mergeOverlapping(matches);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].riskLevel, 'high');
  });

  it('prefers longer match when risk equal', () => {
    const matches: DetectionMatch[] = [
      { type: 'word', word: 'abc', riskLevel: 'medium', category: 'x', replacement: '***', start: 0, end: 3 },
      { type: 'word', word: 'abcdef', riskLevel: 'medium', category: 'x', replacement: '***', start: 0, end: 6 },
    ];
    const merged = mergeOverlapping(matches);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].end - merged[0].start, 6);
  });

  it('unions partially-overlapping spans without dropping coverage', () => {
    const matches: DetectionMatch[] = [
      { type: 'word', word: 'abcde', riskLevel: 'medium', category: 'x', replacement: '***', start: 0, end: 5 },
      { type: 'regex', word: 'defgh', riskLevel: 'high', category: 'y', replacement: '***', start: 3, end: 8 },
    ];
    const merged = mergeOverlapping(matches, 'abcdefgh');
    assert.equal(merged.length, 1);
    assert.equal(merged[0].start, 0);
    assert.equal(merged[0].end, 8);
    assert.equal(merged[0].riskLevel, 'high');
    assert.equal(merged[0].word, 'abcdefgh');
  });
});

describe('SensitiveDetector', () => {
  it('detects literal sensitive words and returns score + strategy', () => {
    const detector = new SensitiveDetector();
    detector.rebuild([
      { word: '辱骂', riskLevel: 'high', replacement: '***', category: '辱骂' },
    ]);
    const result = detector.detect('请勿辱骂他人');
    assert.equal(result.matches.length, 1);
    assert.equal(result.matches[0].word, '辱骂');
    assert.equal(result.level, 'medium');
    assert.equal(result.strategy, 'warn');
    assert.equal(result.filteredText, '请勿***他人');
  });

  it('returns empty result on empty text', () => {
    const detector = new SensitiveDetector();
    detector.rebuild([{ word: 'foo', riskLevel: 'low', replacement: '***', category: 'x' }]);
    const result = detector.detect('');
    assert.deepEqual(result.matches, []);
    assert.equal(result.score, 0);
  });

  it('detects sensitive words written in full-width characters', () => {
    const detector = new SensitiveDetector();
    detector.rebuild([{ word: 'abc', riskLevel: 'low', replacement: '***', category: 'x' }]);
    const result = detector.detect('hello ＡＢＣ world');
    assert.equal(result.matches.length, 1);
    assert.equal(result.matches[0].word, 'ＡＢＣ');
  });

  it('detects sensitive words separated by zero-width characters', () => {
    const detector = new SensitiveDetector();
    detector.rebuild([{ word: 'foo', riskLevel: 'high', replacement: '***', category: 'x' }]);
    const zws = String.fromCharCode(0x200b);
    const result = detector.detect(`he f${zws}oo bar`);
    assert.equal(result.matches.length, 1);
    assert.equal(result.matches[0].word, `f${zws}oo`);
  });

  it('skips matches inside whitelist URLs', () => {
    const detector = new SensitiveDetector();
    detector.rebuild([]);
    const result = detector.detect('see https://github.com/org/repo for details');
    assert.equal(result.matches.length, 0);
  });

  it('rejects text crossing high-risk threshold', () => {
    const detector = new SensitiveDetector();
    detector.rebuild([
      { word: 'h1', riskLevel: 'high', replacement: '***', category: 'x' },
      { word: 'h2', riskLevel: 'high', replacement: '***', category: 'x' },
    ]);
    const result = detector.detect('h1 and h2');
    assert.equal(result.strategy, 'reject');
    assert.equal(result.level, 'high');
  });
});
