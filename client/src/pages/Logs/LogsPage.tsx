import { Card, Table } from 'antd';
import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { logApi } from '@/services/api.js';
import type { OperationLog } from '@/types/index.js';

export function LogsPage() {
  const [data, setData] = useState<OperationLog[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState({ page: 1, pageSize: 10 });

  const load = (params = query) => {
    logApi.list(params).then((result) => {
      setData(result.list);
      setTotal(result.total);
    });
  };

  useEffect(() => load(), []);

  return (
    <Card title="操作日志">
      <Table
        rowKey="id"
        dataSource={data}
        pagination={{
          total,
          current: query.page,
          pageSize: query.pageSize,
          onChange: (page, pageSize) => {
            const next = { page, pageSize };
            setQuery(next);
            load(next);
          },
        }}
        columns={[
          { title: '用户', dataIndex: ['user', 'username'], width: 120 },
          { title: '动作', dataIndex: 'action', width: 180 },
          { title: '对象', dataIndex: 'targetType', width: 120 },
          { title: '对象ID', dataIndex: 'targetId', width: 100 },
          { title: 'IP', dataIndex: 'ip', width: 140 },
          { title: '时间', dataIndex: 'createdAt', render: (value) => dayjs(value).format('YYYY-MM-DD HH:mm:ss'), width: 190 },
          { title: '详情', dataIndex: 'detail', ellipsis: true },
        ]}
      />
    </Card>
  );
}
