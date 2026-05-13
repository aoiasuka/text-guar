import { Button, Card, Col, Progress, Row, Space, Statistic, Table, Typography } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';
import { reportApi } from '@/services/api.js';
import { useAuthStore } from '@/stores/useAuthStore.js';

export function ReportsPage() {
  const [stats, setStats] = useState<Awaited<ReturnType<typeof reportApi.stats>>>();
  const token = useAuthStore((state) => state.token);

  useEffect(() => {
    reportApi.stats().then(setStats);
  }, []);

  const download = (type: 'word' | 'excel') => {
    reportApi.download(type, token);
  };

  return (
    <Space direction="vertical" size={16} className="full">
      <Row gutter={[16, 16]}>
        <Col xs={24} md={6}><Card><Statistic title="内容总数" value={stats?.totalContents || 0} /></Card></Col>
        <Col xs={24} md={6}><Card><Statistic title="待审核" value={stats?.pending || 0} /></Card></Col>
        <Col xs={24} md={6}><Card><Statistic title="高风险" value={stats?.highRisk || 0} /></Card></Col>
        <Col xs={24} md={6}><Card><Statistic title="通过率" value={stats?.passRate || 0} suffix="%" /></Card></Col>
      </Row>
      <Card
        title="审核报表"
        extra={
          <Space>
            <Button icon={<DownloadOutlined />} onClick={() => download('word')}>Word 报告</Button>
            <Button icon={<DownloadOutlined />} onClick={() => download('excel')}>Excel 报表</Button>
          </Space>
        }
      >
        <Typography.Title level={5}>风险分布</Typography.Title>
        <Space direction="vertical" className="full">
          {(stats?.riskDistribution || []).map((item) => (
            <div key={item.riskLevel} className="risk-row">
              <span>{item.riskLevel}</span>
              <Progress percent={Math.round((item._count / Math.max(stats?.totalContents || 1, 1)) * 100)} />
            </div>
          ))}
        </Space>
      </Card>
      <Card title="最近日志">
        <Table
          rowKey="id"
          dataSource={stats?.recentLogs || []}
          pagination={false}
          columns={[
            { title: '用户', dataIndex: ['user', 'username'] },
            { title: '动作', dataIndex: 'action' },
            { title: '对象', dataIndex: 'targetType' },
            { title: 'IP', dataIndex: 'ip' },
          ]}
        />
      </Card>
    </Space>
  );
}
