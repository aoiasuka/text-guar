import { useMemo } from 'react';
import type { DetectionMatch, RiskLevel } from '@text-guard/shared';

interface HighlightedTextProps {
  text: string;
  matches?: DetectionMatch[];
  className?: string;
}

const tone: Record<RiskLevel, { background: string; color: string; border: string }> = {
  low: { background: '#f6ffed', color: '#389e0d', border: '#b7eb8f' },
  medium: { background: '#fffbe6', color: '#d48806', border: '#ffe58f' },
  high: { background: '#fff1f0', color: '#cf1322', border: '#ffa39e' },
};

export function HighlightedText({ text, matches, className }: HighlightedTextProps) {
  const segments = useMemo(() => {
    if (!matches || matches.length === 0) {
      return [{ text, match: undefined as DetectionMatch | undefined }];
    }
    const sorted = [...matches].sort((a, b) => a.start - b.start || b.end - a.end);
    const result: Array<{ text: string; match?: DetectionMatch }> = [];
    let cursor = 0;
    for (const match of sorted) {
      if (match.start < cursor) continue;
      if (match.start > cursor) result.push({ text: text.slice(cursor, match.start) });
      result.push({ text: text.slice(match.start, match.end), match });
      cursor = match.end;
    }
    if (cursor < text.length) result.push({ text: text.slice(cursor) });
    return result;
  }, [text, matches]);

  return (
    <pre className={className}>
      {segments.map((segment, index) =>
        segment.match ? (
          <mark
            key={index}
            title={`${segment.match.category} · ${segment.match.riskLevel}`}
            style={{
              padding: '0 4px',
              margin: '0 1px',
              borderRadius: 3,
              border: `1px solid ${tone[segment.match.riskLevel].border}`,
              background: tone[segment.match.riskLevel].background,
              color: tone[segment.match.riskLevel].color,
            }}
          >
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </pre>
  );
}
