import type { FilterStrategy, RiskLevel } from '@text-guard/shared';

export const riskWeight: Record<RiskLevel, number> = {
  low: 5,
  medium: 15,
  high: 40,
};

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
