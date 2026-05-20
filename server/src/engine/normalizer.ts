import { pinyin } from 'pinyin-pro';

const FULLWIDTH_OFFSET = 0xfee0;
const FULLWIDTH_RANGE = { start: 0xff01, end: 0xff5e };
const FULLWIDTH_SPACE = 0x3000;

// Zero-width / bidirectional control / soft hyphen / BOM / Mongolian vowel separator / Word joiner
const ZERO_WIDTH_CODES = new Set<number>([
  0x00ad, // soft hyphen
  0x180e, // mongolian vowel separator
  0x200b, // zero-width space
  0x200c, // zero-width non-joiner
  0x200d, // zero-width joiner
  0x200e, // left-to-right mark
  0x200f, // right-to-left mark
  0x202a, // left-to-right embedding
  0x202b, // right-to-left embedding
  0x202c, // pop directional formatting
  0x202d, // left-to-right override
  0x202e, // right-to-left override
  0x2060, // word joiner
  0x2061, // function application
  0x2062, // invisible times
  0x2063, // invisible separator
  0x2064, // invisible plus
  0xfeff, // zero-width no-break space (BOM)
]);

// Leet 反映射：把数字/符号还原为字母
const LEET_MAP: Record<string, string> = {
  '@': 'a',
  '4': 'a',
  '3': 'e',
  '1': 'i',
  '!': 'i',
  '0': 'o',
  $: 's',
  '5': 's',
  '7': 't',
  '+': 't',
  '8': 'b',
  '6': 'g',
  '9': 'g',
};

// 高频敏感场景下的形近字归并（少量精选，避免过度归并伤准确率）
export const SIMILAR_CHARS: Record<string, string> = {
  睹: '赌',
  堵: '赌',
  賭: '赌',
  覩: '赌',
  搏: '博',
  愽: '博',
  傅: '博',
  攻: '攻',
  功: '攻',
  攴: '攻',
  擊: '击',
  撃: '击',
  暴: '暴',
  曝: '暴',
  爆: '暴',
  虣: '暴',
  毒: '毒',
  独: '毒',
  獨: '毒',
  力: '力',
  立: '力',
  詐: '诈',
  骗: '骗',
  騙: '骗',
  賂: '赂',
  贿: '贿',
  賄: '贿',
};

// 词中间常见噪声符号（用户绕过时插入），扫描时剔除但保留 origMap
// 注意：这里覆盖了部分 LEET_MAP 的键（@、!、$ 等）——
// 当这些字符出现在中文词中间时按噪声剔除（"赌@博"→"赌博"）；
// 若用户文本是纯字母（"adm!n"），denoised candidate 会全部移除符号，
// 而 leet candidate 再做 "!→i" 反映射，两个候选互补覆盖。
const NOISE_CHARS = new Set<string>([
  ' ',
  '·',
  '_',
  '-',
  '*',
  '.',
  '・',
  '|',
  '/',
  '\\',
  '@',
  '#',
  '!',
  '$',
  '%',
  '^',
  '&',
  '+',
  '=',
  '?',
  '`',
  '~',
  ',',
  ';',
  ':',
  '"',
  "'",
]);

export interface NormalizedText {
  text: string;
  origMap: number[];
}

export interface VariantCandidate {
  text: string;
  origMap: number[];
  label: 'plain' | 'denoised' | 'leet' | 'pinyin_full' | 'pinyin_initial' | 'similar';
}

function normalizeChar(ch: string): string {
  const code = ch.charCodeAt(0);
  if (code === FULLWIDTH_SPACE) return ' ';
  if (code >= FULLWIDTH_RANGE.start && code <= FULLWIDTH_RANGE.end) {
    return String.fromCharCode(code - FULLWIDTH_OFFSET);
  }
  return ch;
}

export function normalize(original: string): NormalizedText {
  const chars: string[] = [];
  const origMap: number[] = [];
  for (let i = 0; i < original.length; i += 1) {
    const code = original.charCodeAt(i);
    if (ZERO_WIDTH_CODES.has(code)) continue;
    const normalized = normalizeChar(original[i]).toLowerCase();
    origMap.push(i);
    chars.push(normalized);
  }
  origMap.push(original.length);
  return { text: chars.join(''), origMap };
}

export function mapToOriginalRange(
  normalized: { text: string; origMap: number[] },
  start: number,
  end: number,
): { start: number; end: number } {
  const safeStart = Math.max(0, Math.min(start, normalized.text.length));
  const safeEnd = Math.max(safeStart, Math.min(end, normalized.text.length));
  return {
    start: normalized.origMap[safeStart] ?? 0,
    end: normalized.origMap[safeEnd] ?? normalized.origMap[normalized.origMap.length - 1] ?? 0,
  };
}

// 把 normalize 结果再展开成多个变体候选串，每个候选保留 origMap
// 调用方拿到 candidates 后对每个 candidate 独立做字面扫描，命中后用其 origMap 回到原文坐标
export function expandVariants(normalized: NormalizedText): VariantCandidate[] {
  const out: VariantCandidate[] = [];

  // 1. 去噪：剔除词中间的标点干扰符
  const denoisedChars: string[] = [];
  const denoisedMap: number[] = [];
  for (let i = 0; i < normalized.text.length; i += 1) {
    const ch = normalized.text[i];
    if (NOISE_CHARS.has(ch)) continue;
    denoisedChars.push(ch);
    denoisedMap.push(normalized.origMap[i]);
  }
  denoisedMap.push(normalized.origMap[normalized.text.length]);
  if (denoisedChars.length !== normalized.text.length) {
    out.push({ text: denoisedChars.join(''), origMap: denoisedMap, label: 'denoised' });
  }

  // 2. leet 反映射：以去噪文本为基础
  const sourceText = denoisedChars.length ? denoisedChars : normalized.text.split('');
  const sourceMap = denoisedChars.length
    ? denoisedMap
    : [...normalized.origMap];
  let leetChanged = false;
  const leetChars = sourceText.map((ch) => {
    const replaced = LEET_MAP[ch];
    if (replaced) {
      leetChanged = true;
      return replaced;
    }
    return ch;
  });
  if (leetChanged) {
    out.push({ text: leetChars.join(''), origMap: sourceMap, label: 'leet' });
  }

  // 3. 形近字归并
  let similarChanged = false;
  const similarChars = sourceText.map((ch) => {
    const replaced = SIMILAR_CHARS[ch];
    if (replaced && replaced !== ch) {
      similarChanged = true;
      return replaced;
    }
    return ch;
  });
  if (similarChanged) {
    out.push({ text: similarChars.join(''), origMap: sourceMap, label: 'similar' });
  }

  // 4. 拼音全拼：每个汉字 → 全拼字母序列（多字符 → 1 个原始位置映射到多个候选位置）
  //    形如 「赌博」 → "dubo"，需要 origMap 把每个拼音字母指回原汉字
  const pinyinFullChars: string[] = [];
  const pinyinFullMap: number[] = [];
  let hasPinyin = false;
  for (let i = 0; i < sourceText.length; i += 1) {
    const ch = sourceText[i];
    const origIdx = sourceMap[i];
    if (/[一-鿿]/.test(ch)) {
      const py = pinyin(ch, { toneType: 'none', type: 'string' }).replace(/\s+/g, '');
      if (py) {
        hasPinyin = true;
        for (const letter of py) {
          pinyinFullChars.push(letter);
          pinyinFullMap.push(origIdx);
        }
        continue;
      }
    }
    pinyinFullChars.push(ch);
    pinyinFullMap.push(origIdx);
  }
  pinyinFullMap.push(sourceMap[sourceText.length] ?? normalized.origMap[normalized.origMap.length - 1]);
  if (hasPinyin) {
    out.push({ text: pinyinFullChars.join(''), origMap: pinyinFullMap, label: 'pinyin_full' });
  }

  // 5. 拼音首字母：「赌博」 → "db"
  const pinyinInitialChars: string[] = [];
  const pinyinInitialMap: number[] = [];
  let hasInitial = false;
  for (let i = 0; i < sourceText.length; i += 1) {
    const ch = sourceText[i];
    const origIdx = sourceMap[i];
    if (/[一-鿿]/.test(ch)) {
      const py = pinyin(ch, { toneType: 'none', type: 'string', pattern: 'first' }).replace(/\s+/g, '');
      if (py) {
        hasInitial = true;
        pinyinInitialChars.push(py[0]);
        pinyinInitialMap.push(origIdx);
        continue;
      }
    }
    pinyinInitialChars.push(ch);
    pinyinInitialMap.push(origIdx);
  }
  pinyinInitialMap.push(sourceMap[sourceText.length] ?? normalized.origMap[normalized.origMap.length - 1]);
  if (hasInitial) {
    out.push({ text: pinyinInitialChars.join(''), origMap: pinyinInitialMap, label: 'pinyin_initial' });
  }

  return out;
}
