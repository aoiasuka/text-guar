import { Alert, Empty, Progress, Space, Table, Tag, Tooltip, Typography } from 'antd';
import { useMemo } from 'react';
import type { DetectionMatch, DetectionResult, RiskLevel } from '@text-guard/shared';
import { RiskTag } from './RiskTag.js';

const riskOrder: Record<RiskLevel, number> = { high: 0, medium: 1, low: 2 };

const sourceTone: Record<string, string> = {
  literal: 'volcano',
  literal_variant: 'orange',
  regex: 'geekblue',
  credential: 'magenta',
  llm: 'purple',
};

const sourceLabel: Record<string, string> = {
  literal: '字面',
  literal_variant: '变体',
  regex: '正则',
  credential: '凭证',
  llm: 'AI',
};

const verdictLabel: Record<string, string> = {
  sensitive: '确认敏感',
  neutral: '中性',
  quote: '引用',
  reverse: '反向',
};

const verdictTone: Record<string, string> = {
  sensitive: 'red',
  neutral: 'default',
  quote: 'blue',
  reverse: 'green',
};

function confidenceTone(confidence: number): string {
  if (confidence >= 0.85) return '#52c41a';
  if (confidence >= 0.5) return '#faad14';
  return '#d9d9d9';
}

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
            title: '来源',
            dataIndex: 'source',
            width: 90,
            render: (value: string = 'literal') => (
              <Tag color={sourceTone[value] || 'default'}>{sourceLabel[value] || value}</Tag>
            ),
          },
          {
            title: '置信度',
            dataIndex: 'confidence',
            width: 130,
            render: (value: number | undefined, row) => {
              const c = value ?? 1;
              return (
                <Tooltip title={row.reason || `${Math.round(c * 100)}%`}>
                  <Progress
                    percent={Math.round(c * 100)}
                    size="small"
                    strokeColor={confidenceTone(c)}
                    format={(percent) => `${percent}%`}
                  />
                </Tooltip>
              );
            },
          },
          {
            title: 'AI 复核',
            dataIndex: 'judgeVerdict',
            width: 110,
            render: (value: string | undefined, row) =>
              value ? (
                <Tooltip title={row.reason}>
                  <Tag color={verdictTone[value]}>{verdictLabel[value] || value}</Tag>
                </Tooltip>
              ) : (
                <Typography.Text type="secondary">—</Typography.Text>
              ),
          },
          { title: '分类', dataIndex: 'category', width: 100 },
          { title: '风险', dataIndex: 'riskLevel', width: 90, render: (value) => <RiskTag level={value} /> },
          {
            title: '位置',
            width: 90,
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
