import { Card, Col, List, Row, Space, Statistic, Table, Typography } from 'antd';
import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { reportApi, reviewApi } from '@/services/api.js';
import { RiskTag } from '@/components/RiskTag.js';
import { StatusTag } from '@/components/StatusTag.js';
import type { Content } from '@/types/index.js';

export function DashboardPage() {
  const [stats, setStats] = useState<Awaited<ReturnType<typeof reportApi.stats>>>();
  const [pending, setPending] = useState<Content[]>([]);

  useEffect(() => {
    reportApi.stats().then(setStats);
    reviewApi.pending({ page: 1, pageSize: 5 }).then((data) => setPending(data.list));
  }, []);

  return (
    <Space direction="vertical" size={18} className="full">
      <div>
        <Typography.Title level={2}>工作台</Typography.Title>
        <Typography.Text type="secondary">关键指标、待审队列与最近操作集中查看。</Typography.Text>
      </div>
      <Row gutter={[16, 16]}>
        {[
          ['内容总数', stats?.totalContents || 0],
          ['待审核', stats?.pending || 0],
          ['高风险内容', stats?.highRisk || 0],
          ['审核通过率', `${stats?.passRate || 0}%`],
        ].map(([label, value]) => (
          <Col xs={24} sm={12} lg={6} key={label}>
            <Card>
              <Statistic title={label} value={value} />
            </Card>
          </Col>
        ))}
      </Row>
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={15}>
          <Card title="待审核内容">
            <Table
              rowKey="id"
              dataSource={pending}
              pagination={false}
              columns={[
                { title: '标题', dataIndex: 'title' },
                { title: '分类', dataIndex: 'category' },
                { title: '风险', dataIndex: 'riskLevel', render: (value) => <RiskTag level={value} /> },
                { title: '状态', dataIndex: 'status', render: (value) => <StatusTag status={value} /> },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} xl={9}>
          <Card title="最近操作">
            <List
              dataSource={stats?.recentLogs || []}
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
