import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { normalize, mapToOriginalRange } from '../src/engine/normalizer.js';

const ZWS = String.fromCharCode(0x200b); // zero-width space

describe('normalize', () => {
  it('passes through plain ascii unchanged', () => {
    const result = normalize('hello world');
    assert.equal(result.text, 'hello world');
    assert.equal(result.origMap.length, 'hello world'.length + 1);
  });

  it('lowercases letters', () => {
    const result = normalize('Hello');
    assert.equal(result.text, 'hello');
  });

  it('converts full-width digits and letters to half-width', () => {
    const result = normalize('１２３ＡＢ');
    assert.equal(result.text, '123ab');
  });

  it('strips zero-width characters and keeps positions in original', () => {
    const original = `ab${ZWS}cd`;
    const result = normalize(original);
    assert.equal(result.text, 'abcd');
    assert.equal(result.origMap.length, 5);
    assert.equal(result.origMap[0], 0); // a
    assert.equal(result.origMap[1], 1); // b
    assert.equal(result.origMap[2], 3); // c (skipping zero-width at index 2)
    assert.equal(result.origMap[3], 4); // d
    assert.equal(result.origMap[4], original.length); // sentinel
  });

  it('mapToOriginalRange spans across zero-width interference', () => {
    const original = `fo${ZWS}obar`;
    const normalized = normalize(original);
    const range = mapToOriginalRange(normalized, 0, 3);
    assert.deepEqual(range, { start: 0, end: 4 });
  });

  it('mapToOriginalRange clamps out-of-bounds inputs', () => {
    const normalized = normalize('abc');
    const range = mapToOriginalRange(normalized, -2, 100);
    assert.equal(range.start, 0);
    assert.equal(range.end, 3);
  });
});
