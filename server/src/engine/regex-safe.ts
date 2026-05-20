import { RE2 } from 're2-wasm';

/**
 * 用户自定义正则的"安全"编译器：
 * - 首选用 re2-wasm 编译（线性时间，杜绝 ReDoS）
 * - re2 不支持的特性（lookbehind、反向引用、部分 Unicode 类等）→ 抛 RegexSafeError
 *   由调用方决定是放弃还是降级到 V8 RegExp（建议放弃，避免 ReDoS）
 */

export class RegexSafeError extends Error {
  readonly reason: 'unsupported' | 'invalid';
  constructor(message: string, reason: 'unsupported' | 'invalid') {
    super(message);
    this.name = 'RegexSafeError';
    this.reason = reason;
  }
}

export interface CompiledPattern {
  source: string;
  flags: string;
  // 与 RegExp 接口对齐的最小子集
  matchAll(text: string): Iterable<{ match: string; index: number }>;
  test(text: string): boolean;
}

// 把 `(?i)/(?s)/(?m)/(?u)` 这类内联前缀提取成 flags
function extractInlineFlags(pattern: string): { body: string; flags: string } {
  const match = /^\(\?([imsu]+)\)/.exec(pattern);
  if (!match) return { body: pattern, flags: '' };
  return { body: pattern.slice(match[0].length), flags: match[1] };
}

export function compileUserPattern(pattern: string): CompiledPattern {
  const { body, flags } = extractInlineFlags(pattern);
  // re2-wasm 强制要求 'u' flag；'g' 用于全局匹配
  const needFlags = ['u', 'g'];
  for (const f of flags) if (!needFlags.includes(f)) needFlags.push(f);
  const fullFlags = needFlags.join('');
  let re2: RE2;
  try {
    re2 = new RE2(body, fullFlags);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const reason = /not supported|unsupported|invalid escape|unicode/i.test(msg) ? 'unsupported' : 'invalid';
    throw new RegexSafeError(
      reason === 'unsupported'
        ? `该正则使用了 re2 不支持的特性（如 lookbehind / 反向引用），为防 ReDoS 已拒绝：${msg}`
        : `正则不合法：${msg}`,
      reason,
    );
  }

  return {
    source: body,
    flags: fullFlags,
    *matchAll(text: string) {
      let cursor = 0;
      const re = new RE2(body, fullFlags);
      while (cursor <= text.length) {
        re.lastIndex = cursor;
        const r = re.exec(text);
        if (!r || r.index === undefined) break;
        const matched = r[0] ?? '';
        if (matched.length === 0) {
          cursor += 1;
          continue;
        }
        yield { match: matched, index: r.index };
        cursor = r.index + matched.length;
      }
    },
    test(text: string) {
      return re2.test(text);
    },
  };
}

/**
 * 仅做语法/支持性预检，不返回编译产物。供 zod refine 使用。
 */
export function validateUserPattern(pattern: string): { ok: true } | { ok: false; reason: string } {
  try {
    compileUserPattern(pattern);
    return { ok: true };
  } catch (error) {
    if (error instanceof RegexSafeError) {
      return { ok: false, reason: error.message };
    }
    return { ok: false, reason: error instanceof Error ? error.message : '未知错误' };
  }
}
