import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { SensitiveDetector } from '../src/engine/detector.js';

function buildWithCredential() {
  const d = new SensitiveDetector();
  d.rebuild([
    { word: '凭证', matchType: 'credential', riskLevel: 'medium', replacement: '[凭证]', category: '隐私' },
  ]);
  return d;
}

describe('credential templates · P4 扩展', () => {
  it('AWS Access Key 命中', () => {
    const r = buildWithCredential().detect('our key is AKIAIOSFODNN7EXAMPLE');
    const hit = r.matches.find((m) => /AKIA/.test(m.word));
    assert.ok(hit, '应命中 AWS Access Key');
    assert.equal(hit?.source, 'credential');
    assert.equal(hit?.riskLevel, 'high');
  });

  it('GitHub PAT (ghp_) 命中', () => {
    const r = buildWithCredential().detect('use token ghp_1234567890abcdefghijklmnopqrstuvwxyz1234 to clone');
    const hit = r.matches.find((m) => m.word.startsWith('ghp_'));
    assert.ok(hit, '应命中 GitHub PAT');
    assert.equal(hit?.source, 'credential');
  });

  it('JWT 命中', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const r = buildWithCredential().detect(`Authorization Bearer ${jwt}`);
    const hit = r.matches.find((m) => m.word.includes('eyJ'));
    assert.ok(hit, '应命中 JWT');
  });

  it('数据库连接串命中', () => {
    const r = buildWithCredential().detect('connect to mysql://root:pa55word@db.internal/app');
    const hit = r.matches.find((m) => /mysql:\/\//.test(m.word));
    assert.ok(hit, '应命中数据库连接串');
    assert.equal(hit?.riskLevel, 'high');
  });

  it('bcrypt hash 命中', () => {
    const r = buildWithCredential().detect('hashed: $2a$10$abcdefghijklmnopqrstuvABCDEFGHIJKLMNOPQRSTUVWXYZ01234');
    const hit = r.matches.find((m) => m.word.startsWith('$2a$'));
    assert.ok(hit, '应命中 bcrypt hash');
  });

  it('PEM 私钥块命中', () => {
    const pem = '-----BEGIN RSA PRIVATE KEY-----\nMIIBOgIBAAJBAKj+xx\n-----END RSA PRIVATE KEY-----';
    const r = buildWithCredential().detect(`私钥：\n${pem}\n勿外泄`);
    const hit = r.matches.find((m) => m.word.includes('BEGIN RSA PRIVATE KEY'));
    assert.ok(hit, '应命中 PEM 私钥');
  });

  it('每条规则带独立 category（不只是用户配置的"隐私"）', () => {
    const r = buildWithCredential().detect('AWS key AKIAIOSFODNN7EXAMPLE');
    const hit = r.matches.find((m) => /AKIA/.test(m.word));
    assert.equal(hit?.category, '凭证-云密钥', 'AWS 命中应使用规则自带的 category');
  });

  it('未配置 credential 词条时凭证规则不被触发', () => {
    const d = new SensitiveDetector();
    d.rebuild([
      { word: '泄密', matchType: 'literal', riskLevel: 'high', replacement: '***', category: '安全' },
    ]);
    const r = d.detect('AKIAIOSFODNN7EXAMPLE');
    assert.equal(r.matches.length, 0, '没启用 credential 模式时不应命中 AWS Key');
  });
});

describe('regex safety · re2 ReDoS 防护', () => {
  it('catastrophic backtracking 模式应被 re2 编译并安全运行', async () => {
    const d = new SensitiveDetector();
    d.rebuild([
      // 经典 ReDoS pattern：在 V8 RegExp 下对 'aaaa...aaab' 会指数级回溯
      { word: '回溯炸弹', matchType: 'regex', pattern: '(a+)+b', riskLevel: 'high', replacement: '***', category: '测试' },
    ]);
    const malicious = 'a'.repeat(40);
    const t0 = Date.now();
    const r = d.detect(malicious);
    const elapsed = Date.now() - t0;
    // re2 是线性时间，对该输入应在 1s 内返回（实际 <100ms）；
    // 若回退到 V8 RegExp 则可能跑数十秒挂死
    assert.ok(elapsed < 1500, `re2 应线性时间返回，实际 ${elapsed}ms`);
    assert.equal(r.matches.length, 0, '"aaa...aaa" 不含 b，不应命中');
  });

  it('正常正则功能保持兼容', () => {
    const d = new SensitiveDetector();
    d.rebuild([
      {
        word: '弱密码',
        matchType: 'regex',
        pattern: '(?i)password\\s*[:=]\\s*(?:admin|123456)',
        riskLevel: 'high',
        replacement: '[弱密码]',
        category: '隐私',
      },
    ]);
    const r = d.detect('config: PASSWORD = admin');
    const hit = r.matches.find((m) => m.source === 'regex');
    assert.ok(hit, '应命中弱密码规则');
    assert.equal(hit?.riskLevel, 'high');
  });
});
