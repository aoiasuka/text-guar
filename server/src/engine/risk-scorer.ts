import type { DetectionMatch, FilterStrategy, RiskLevel } from '@text-guard/shared';

export const riskWeight: Record<RiskLevel, number> = {
  low: 5,
  medium: 15,
  high: 40,
};

// Confidence floor: matches below this are dropped before scoring
export const CONFIDENCE_DROP_BELOW = 0.5;

export function getRiskLevel(score: number): RiskLevel {
  if (score >= 60) return 'high';
  if (score >= 30) return 'medium';
  return 'low';
}

export function getFilterStrategy(score: number): FilterStrategy {
  if (score >= 60) return 'reject';
  if (score >= 30) return 'warn';
  return 'replace';
}

// Weighted score: each match contributes baseWeight × confidence
// Backwards compatible: matches without confidence default to 1.0
export function scoreMatches(matches: DetectionMatch[]): number {
  return matches.reduce((sum, m) => {
    const confidence = m.confidence ?? 1;
    return sum + riskWeight[m.riskLevel] * confidence;
  }, 0);
}
