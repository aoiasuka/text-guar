import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { scanByRegex } from '../src/engine/regex-rules.js';

describe('scanByRegex', () => {
  it('detects Chinese mobile numbers', () => {
    const matches = scanByRegex('联系我 13912345678');
    const phone = matches.find((m) => m.category === '个人信息' && m.replacement === '[手机号]');
    assert.ok(phone, '应当命中手机号');
    assert.equal(phone!.word, '13912345678');
  });

  it('detects email addresses', () => {
    const matches = scanByRegex('mail me at test@example.com');
    const email = matches.find((m) => m.replacement === '[邮箱]');
    assert.ok(email, '应当命中邮箱');
  });

  it('detects valid IDs and skips invalid ones', () => {
    // valid ID with correct checksum
    const matches = scanByRegex('身份证号 11010519491231002X');
    const id = matches.find((m) => m.replacement === '[身份证号]');
    assert.ok(id, '应当命中合法身份证号');

    // random 18-digit number without valid checksum should not match
    const noise = scanByRegex('数字 12345678901234567X');
    const noisy = noise.find((m) => m.replacement === '[身份证号]');
    assert.equal(noisy, undefined);
  });

  it('detects IPv4 addresses', () => {
    const matches = scanByRegex('服务器 10.0.0.1 已上线');
    const ip = matches.find((m) => m.replacement === '[IP]');
    assert.ok(ip);
  });
});
