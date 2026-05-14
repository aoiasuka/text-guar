import type { DetectionMatch } from '@text-guard/shared';

export function applyReplacement(text: string, matches: DetectionMatch[]) {
  if (matches.length === 0) return text;

  const sorted = [...matches].sort((a, b) => a.start - b.start || b.end - a.end);
  const parts: string[] = [];
  let cursor = 0;

  for (const match of sorted) {
    if (match.start < cursor) continue;
    if (match.start > cursor) parts.push(text.slice(cursor, match.start));
    parts.push(match.replacement || '***');
    cursor = match.end;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));

  return parts.join('');
}
