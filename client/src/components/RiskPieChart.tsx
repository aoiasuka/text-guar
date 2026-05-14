import { useMemo } from 'react';

interface PieSlice {
  label: string;
  value: number;
  color: string;
}

interface RiskPieChartProps {
  data: PieSlice[];
  size?: number;
}

export function RiskPieChart({ data, size = 180 }: RiskPieChartProps) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const slices = useMemo(() => {
    if (total === 0) return [];
    let cumulative = 0;
    const radius = size / 2;
    return data.map((item) => {
      const ratio = item.value / total;
      const startAngle = cumulative * Math.PI * 2;
      cumulative += ratio;
      const endAngle = cumulative * Math.PI * 2;
      const largeArc = ratio > 0.5 ? 1 : 0;
      const x1 = radius + radius * Math.sin(startAngle);
      const y1 = radius - radius * Math.cos(startAngle);
      const x2 = radius + radius * Math.sin(endAngle);
      const y2 = radius - radius * Math.cos(endAngle);
      const d = ratio === 1
        ? `M ${radius} 0 A ${radius} ${radius} 0 1 1 ${radius - 0.001} 0 Z`
        : `M ${radius} ${radius} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;
      return { ...item, d, ratio };
    });
  }, [data, total, size]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {total === 0 ? (
          <circle cx={size / 2} cy={size / 2} r={size / 2 - 1} fill="#eef1ec" stroke="#dde5dc" />
        ) : (
          slices.map((slice) => (
            <path key={slice.label} d={slice.d} fill={slice.color} stroke="#fff" strokeWidth={1.5} />
          ))
        )}
        <circle cx={size / 2} cy={size / 2} r={size / 3} fill="#fff" />
        <text x={size / 2} y={size / 2 - 4} textAnchor="middle" fontSize={13} fill="#5a6664">
          风险总数
        </text>
        <text x={size / 2} y={size / 2 + 18} textAnchor="middle" fontSize={22} fontWeight={700} fill="#1c2523">
          {total}
        </text>
      </svg>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8, minWidth: 140 }}>
        {data.map((item) => {
          const ratio = total === 0 ? 0 : (item.value / total) * 100;
          return (
            <li key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: item.color }} />
              <span style={{ flex: 1, color: '#3d4845' }}>{item.label}</span>
              <span style={{ color: '#1c2523', fontWeight: 600 }}>{item.value}</span>
              <span style={{ color: '#7d8784', width: 48, textAlign: 'right' }}>{ratio.toFixed(0)}%</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
