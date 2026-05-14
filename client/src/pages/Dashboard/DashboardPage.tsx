import { Card, Col, Empty, List, Row, Skeleton, Space, Statistic, Table, Tag, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { reportApi, reviewApi } from '@/services/api.js';
import { RiskTag } from '@/components/RiskTag.js';
import { StatusTag } from '@/components/StatusTag.js';
import { RiskPieChart } from '@/components/RiskPieChart.js';
import type { Content } from '@/types/index.js';

const riskColor: Record<string, string> = {
  low: '#52c41a',
  medium: '#faad14',
  high: '#f5222d',
};

const riskLabel: Record<string, string> = {
  low: '低风险',
  medium: '中风险',
  high: '高风险',
};

export function DashboardPage() {
  const [stats, setStats] = useState<Awaited<ReturnType<typeof reportApi.stats>>>();
  const [pending, setPending] = useState<Content[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    Promise.all([reportApi.stats(), reviewApi.pending({ page: 1, pageSize: 5 })])
      .then(([statsResult, pendingResult]) => {
        if (!mounted) return;
        setStats(statsResult);
        setPending(pendingResult.list);
      })
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, []);

  const riskSlices = useMemo(() => {
    const order: Array<'high' | 'medium' | 'low'> = ['high', 'medium', 'low'];
    const map = new Map(stats?.riskDistribution?.map((item) => [item.riskLevel, item._count]));
    return order.map((level) => ({
      label: riskLabel[level],
      value: map.get(level) ?? 0,
      color: riskColor[level],
    }));
  }, [stats]);

  const statusSummary = useMemo(() => {
    if (!stats) return [];
    return [
      { label: '草稿', value: Math.max(0, stats.totalContents - stats.pending - stats.published - stats.rejected) },
      { label: '待审核', value: stats.pending, tone: 'processing' as const },
      { label: '已发布', value: stats.published, tone: 'success' as const },
      { label: '已驳回', value: stats.rejected, tone: 'error' as const },
    ];
  }, [stats]);

  return (
    <Space direction="vertical" size={18} className="full">
      <div>
        <Typography.Title level={2}>工作台</Typography.Title>
        <Typography.Text type="secondary">关键指标、待审队列与最近操作集中查看。</Typography.Text>
      </div>
      <Row gutter={[16, 16]}>
        {[
          ['内容总数', stats?.totalContents ?? 0, '#1c2523'],
          ['待审核', stats?.pending ?? 0, '#1677ff'],
          ['高风险内容', stats?.highRisk ?? 0, '#f5222d'],
          ['审核通过率', `${stats?.passRate ?? 0}%`, '#52c41a'],
        ].map(([label, value, color]) => (
          <Col xs={24} sm={12} lg={6} key={String(label)}>
            <Card>
              {loading ? (
                <Skeleton.Input active size="large" />
              ) : (
                <Statistic title={String(label)} value={value as number | string} valueStyle={{ color: color as string }} />
              )}
            </Card>
          </Col>
        ))}
      </Row>
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={10}>
          <Card title="风险等级分布" loading={loading}>
            <RiskPieChart data={riskSlices} />
          </Card>
        </Col>
        <Col xs={24} xl={14}>
          <Card title="内容状态概览" loading={loading}>
            <Space wrap size={[16, 16]}>
              {statusSummary.map((item) => (
                <div key={item.label} style={{ minWidth: 120 }}>
                  <Typography.Text type="secondary">{item.label}</Typography.Text>
                  <div style={{ marginTop: 4 }}>
                    <Tag color={item.tone || 'default'} style={{ fontSize: 18, padding: '4px 10px' }}>
                      {item.value}
                    </Tag>
                  </div>
                </div>
              ))}
            </Space>
          </Card>
        </Col>
      </Row>
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={15}>
          <Card title="待审核内容">
            <Table
              rowKey="id"
              dataSource={pending}
              loading={loading}
              pagination={false}
              locale={{ emptyText: <Empty description="暂无待审核内容" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
              columns={[
                { title: '标题', dataIndex: 'title', ellipsis: true },
                { title: '分类', dataIndex: 'category', width: 100 },
                { title: '风险', dataIndex: 'riskLevel', width: 110, render: (value) => <RiskTag level={value} /> },
                { title: '状态', dataIndex: 'status', width: 100, render: (value) => <StatusTag status={value} /> },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} xl={9}>
          <Card title="最近操作">
            <List
              loading={loading}
              dataSource={stats?.recentLogs || []}
              locale={{ emptyText: <Empty description="暂无操作日志" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
              renderItem={(item) => (
                <List.Item>
                  <List.Item.Meta
                    title={`${item.user?.username || '-'} · ${item.action}`}
                    description={dayjs(item.createdAt).format('YYYY-MM-DD HH:mm')}
                  />
                </List.Item>
              )}
            />
          </Card>
        </Col>
      </Row>
    </Space>
  );
}
