import type { DetectionMatch } from '@text-guard/shared';

export function applyReplacement(text: string, matches: DetectionMatch[]) {
  const sorted = [...matches].sort((a, b) => b.start - a.start || b.end - a.end);
  let output = text;

  for (const match of sorted) {
    output =
      output.slice(0, match.start) + (match.replacement || '***') + output.slice(match.end);
  }

  return output;
}
