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

// 按置信度返回高亮样式调整：低置信度淡化为虚线框
function confidenceStyle(confidence: number) {
  if (confidence >= 0.85) return { opacity: 1, borderStyle: 'solid' as const };
  if (confidence >= 0.5) return { opacity: 0.85, borderStyle: 'solid' as const };
  return { opacity: 0.6, borderStyle: 'dashed' as const };
}

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
          (() => {
            const confidence = segment.match.confidence ?? 1;
            const original = segment.match.originalConfidence;
            const cs = confidenceStyle(confidence);
            const confLine = segment.match.judgeVerdict
              ? `置信度 规则 ${Math.round((original ?? confidence) * 100)}% → AI:${segment.match.judgeVerdict} → 最终 ${Math.round(confidence * 100)}%`
              : `置信度 ${Math.round(confidence * 100)}%`;
            const title = [
              `${segment.match.category} · ${segment.match.riskLevel}`,
              confLine,
              segment.match.reason ? `原因：${segment.match.reason}` : '',
            ]
              .filter(Boolean)
              .join(' · ');
            return (
              <mark
                key={index}
                title={title}
                style={{
                  padding: '0 4px',
                  margin: '0 1px',
                  borderRadius: 3,
                  border: `1px ${cs.borderStyle} ${tone[segment.match.riskLevel].border}`,
                  background: tone[segment.match.riskLevel].background,
                  color: tone[segment.match.riskLevel].color,
                  opacity: cs.opacity,
                }}
              >
                {segment.text}
              </mark>
            );
          })()
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </pre>
  );
}
