import { Tag } from 'antd';
import type { RiskLevel } from '@text-guard/shared';

const map = {
  low: { color: 'green', text: '低风险' },
  medium: { color: 'gold', text: '中风险' },
  high: { color: 'red', text: '高风险' },
};

export function RiskTag({ level }: { level?: RiskLevel | null }) {
  if (!level) return <Tag>未检测</Tag>;
  return <Tag color={map[level].color}>{map[level].text}</Tag>;
}
