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

export interface NormalizedText {
  text: string;
  origMap: number[];
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
  normalized: NormalizedText,
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
