import { Alert, Empty, Space, Table, Tag, Typography } from 'antd';
import { useMemo } from 'react';
import type { DetectionMatch, DetectionResult, RiskLevel } from '@text-guard/shared';
import { RiskTag } from './RiskTag.js';

const riskOrder: Record<RiskLevel, number> = { high: 0, medium: 1, low: 2 };
const typeLabel: Record<string, string> = { word: '敏感词', regex: '正则规则' };
const typeTone: Record<string, string> = { word: 'volcano', regex: 'geekblue' };

export function DetectResult({ result }: { result?: DetectionResult }) {
  const sortedMatches = useMemo<DetectionMatch[]>(() => {
    if (!result) return [];
    return [...result.matches].sort(
      (a, b) => riskOrder[a.riskLevel] - riskOrder[b.riskLevel] || a.start - b.start,
    );
  }, [result]);

  if (!result) return null;

  return (
    <Space direction="vertical" size={12} className="full">
      <Alert
        type={result.level === 'high' ? 'error' : result.level === 'medium' ? 'warning' : 'success'}
        message={
          <Space>
            <RiskTag level={result.level} />
            <Typography.Text>{result.summary}</Typography.Text>
            <Typography.Text type="secondary">建议策略：{result.strategy}</Typography.Text>
          </Space>
        }
      />
      <Table
        size="small"
        rowKey={(row) => `${row.start}-${row.end}-${row.word}`}
        dataSource={sortedMatches}
        pagination={false}
        locale={{ emptyText: <Empty description="未发现风险命中" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
        columns={[
          { title: '命中项', dataIndex: 'word', render: (value: string) => <code>{value}</code> },
          {
            title: '类型',
            dataIndex: 'type',
            width: 110,
            render: (value: string) => <Tag color={typeTone[value] || 'default'}>{typeLabel[value] || value}</Tag>,
          },
          { title: '分类', dataIndex: 'category', width: 110 },
          { title: '风险', dataIndex: 'riskLevel', width: 110, render: (value) => <RiskTag level={value} /> },
          {
            title: '位置',
            width: 110,
            render: (_, row) => (
              <Typography.Text type="secondary">
                [{row.start}, {row.end})
              </Typography.Text>
            ),
          },
          { title: '替换', dataIndex: 'replacement' },
        ]}
      />
    </Space>
  );
}
