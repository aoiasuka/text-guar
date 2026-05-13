import { Alert, Space, Table, Typography } from 'antd';
import type { DetectionResult } from '@text-guard/shared';
import { RiskTag } from './RiskTag.js';

export function DetectResult({ result }: { result?: DetectionResult }) {
  if (!result) return null;

  return (
    <Space direction="vertical" size={12} className="full">
      <Alert
        type={result.level === 'high' ? 'error' : result.level === 'medium' ? 'warning' : 'success'}
        message={
          <Space>
            <RiskTag level={result.level} />
            <Typography.Text>{result.summary}</Typography.Text>
          </Space>
        }
      />
      <Table
        size="small"
        rowKey={(row) => `${row.start}-${row.end}-${row.word}`}
        dataSource={result.matches}
        pagination={false}
        columns={[
          { title: '命中项', dataIndex: 'word' },
          { title: '类型', dataIndex: 'type' },
          { title: '分类', dataIndex: 'category' },
          { title: '风险', dataIndex: 'riskLevel', render: (value) => <RiskTag level={value} /> },
          { title: '替换', dataIndex: 'replacement' },
        ]}
      />
    </Space>
  );
}
