import { Alert, Button, Card, Empty, Space, Table, Tag, Typography } from 'antd';
import { ArrowLeftOutlined, ReloadOutlined } from '@ant-design/icons';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { sensitiveApi } from '@/services/api.js';
import type { DetectionEvent, SensitiveWord } from '@/types/index.js';
import { RiskTag } from '@/components/RiskTag.js';

const sourceColor: Record<string, string> = {
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

export function SensitiveWordEventsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const wordId = Number(id);
  const [rule, setRule] = useState<SensitiveWord>();
  const [data, setData] = useState<DetectionEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!wordId) return;
    setLoading(true);
    try {
      const [r, events] = await Promise.all([
        sensitiveApi.detail(wordId),
        sensitiveApi.events(wordId, { page, pageSize }),
      ]);
      setRule(r);
      setData(events.list);
      setTotal(events.total);
    } finally {
      setLoading(false);
    }
  }, [wordId, page, pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Space direction="vertical" size={16} className="full">
      <Card
        title={
          <Space>
            <Button
              type="text"
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate('/sensitive-words')}
            />
            <span>{rule ? `规则审计 · ${rule.word}` : '规则审计'}</span>
            {rule && <Tag color="blue">v{rule.version}</Tag>}
          </Space>
        }
        extra={<Button icon={<ReloadOutlined />} onClick={() => load()} />}
      >
        {rule ? (
          <Alert
            type="info"
            showIcon
            message={
              <Space wrap>
                <span>
                  <Typography.Text type="secondary">分类：</Typography.Text>
                  {rule.category}
                </span>
                <span>
                  <Typography.Text type="secondary">风险：</Typography.Text>
                  <RiskTag level={rule.riskLevel} />
                </span>
                <span>
                  <Typography.Text type="secondary">置信度上限：</Typography.Text>
                  {Math.round(rule.baseConfidence * 100)}%
                </span>
                <span>
                  <Typography.Text type="secondary">上下文：</Typography.Text>
                  {rule.contextScope}
                </span>
                <span>
                  <Typography.Text type="secondary">变体匹配：</Typography.Text>
                  {rule.variantMatch ? '开启' : '关闭'}
                </span>
              </Space>
            }
          />
        ) : null}
      </Card>
      <Card title={`命中事件（共 ${total} 条）`}>
        <Table
          rowKey="id"
          loading={loading}
          dataSource={data}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            onChange: (p, s) => {
              setPage(p);
              setPageSize(s);
            },
          }}
          locale={{
            emptyText: <Empty description="暂无命中事件" image={Empty.PRESENTED_IMAGE_SIMPLE} />,
          }}
          columns={[
            { title: '命中文本', dataIndex: 'hitText', render: (v: string) => <code>{v}</code> },
            {
              title: '来源',
              dataIndex: 'ruleSource',
              width: 90,
              render: (v: string) => <Tag color={sourceColor[v] || 'default'}>{sourceLabel[v] || v}</Tag>,
            },
            {
              title: '风险',
              dataIndex: 'riskLevel',
              width: 90,
              render: (v) => <RiskTag level={v} />,
            },
            {
              title: '置信度',
              dataIndex: 'confidence',
              width: 100,
              render: (v: number) => `${Math.round((v ?? 1) * 100)}%`,
            },
            {
              title: '规则版本',
              dataIndex: 'wordVersion',
              width: 100,
              render: (v: number | null) => (v ? <Tag>v{v}</Tag> : <Typography.Text type="secondary">—</Typography.Text>),
            },
            {
              title: 'AI 复核',
              dataIndex: 'judgeVerdict',
              width: 110,
              render: (v: string | null) =>
                v ? <Tag color="purple">{verdictLabel[v] || v}</Tag> : <Typography.Text type="secondary">—</Typography.Text>,
            },
            {
              title: '原因',
              dataIndex: 'reason',
              ellipsis: true,
              render: (v: string | null) => v || <Typography.Text type="secondary">—</Typography.Text>,
            },
            {
              title: '内容ID',
              dataIndex: 'contentId',
              width: 90,
              render: (v: number | null) => v ?? <Typography.Text type="secondary">—</Typography.Text>,
            },
            {
              title: '时间',
              dataIndex: 'createdAt',
              width: 170,
              render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm:ss'),
            },
          ]}
        />
      </Card>
    </Space>
  );
}
