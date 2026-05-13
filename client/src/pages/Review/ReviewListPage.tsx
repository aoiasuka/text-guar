import { Button, Card, Space, Table } from 'antd';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { reviewApi } from '@/services/api.js';
import type { Content } from '@/types/index.js';
import { RiskTag } from '@/components/RiskTag.js';

export function ReviewListPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<Content[]>([]);

  useEffect(() => {
    reviewApi.pending({ page: 1, pageSize: 20 }).then((result) => setData(result.list));
  }, []);

  return (
    <Card title="审核工作台">
      <Table
        rowKey="id"
        dataSource={data}
        columns={[
          { title: '标题', dataIndex: 'title' },
          { title: '作者', dataIndex: ['author', 'username'], width: 120 },
          { title: '分类', dataIndex: 'category', width: 120 },
          { title: '风险', dataIndex: 'riskLevel', render: (value) => <RiskTag level={value} />, width: 120 },
          { title: '提交时间', dataIndex: 'updatedAt', render: (value) => dayjs(value).format('YYYY-MM-DD HH:mm'), width: 180 },
          {
            title: '操作',
            width: 120,
            render: (_, record) => (
              <Space>
                <Button type="primary" size="small" onClick={() => navigate(`/review/${record.id}`)}>
                  审核
                </Button>
              </Space>
            ),
          },
        ]}
      />
    </Card>
  );
}
