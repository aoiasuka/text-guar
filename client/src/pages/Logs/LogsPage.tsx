import { Button, Card, DatePicker, Form, Input, Select, Space, Table, Tag } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { useCallback, useEffect, useState } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import { logApi } from '@/services/api.js';
import type { OperationLog } from '@/types/index.js';

interface LogQuery {
  page: number;
  pageSize: number;
  action?: string;
  userId?: number;
  targetType?: string;
  startAt?: string;
  endAt?: string;
}

const actionTone: Record<string, string> = {
  login: 'blue',
  create_content: 'cyan',
  update_content: 'gold',
  delete_content: 'volcano',
  submit_content: 'geekblue',
  submit_content_rejected_by_detector: 'red',
  approve_content: 'green',
  reject_content: 'magenta',
  register_user: 'purple',
  create_sensitive_word: 'cyan',
};

const targetOptions = [
  { value: 'content', label: '内容' },
  { value: 'sensitive_word', label: '敏感词' },
  { value: 'user', label: '用户' },
];

export function LogsPage() {
  const [data, setData] = useState<OperationLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState<LogQuery>({ page: 1, pageSize: 10 });

  const load = useCallback((params: LogQuery) => {
    setLoading(true);
    logApi
      .list(params)
      .then((result) => {
        setData(result.list);
        setTotal(result.total);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load(query);
  }, [query, load]);

  return (
    <Card
      title="操作日志"
      extra={
        <Button icon={<ReloadOutlined />} onClick={() => load(query)}>
          刷新
        </Button>
      }
    >
      <Form
        layout="inline"
        className="toolbar"
        onFinish={(values: { action?: string; targetType?: string; range?: [Dayjs, Dayjs] }) => {
          const [start, end] = values.range ?? [];
          setQuery({
            page: 1,
            pageSize: query.pageSize,
            action: values.action || undefined,
            targetType: values.targetType || undefined,
            startAt: start ? start.toISOString() : undefined,
            endAt: end ? end.toISOString() : undefined,
          });
        }}
      >
        <Form.Item name="action">
          <Input placeholder="动作关键字" allowClear style={{ width: 180 }} />
        </Form.Item>
        <Form.Item name="targetType">
          <Select placeholder="对象类型" allowClear style={{ width: 140 }} options={targetOptions} />
        </Form.Item>
        <Form.Item name="range">
          <DatePicker.RangePicker showTime />
        </Form.Item>
        <Space>
          <Button htmlType="submit" type="primary">
            筛选
          </Button>
          <Button
            htmlType="reset"
            onClick={() => setQuery({ page: 1, pageSize: query.pageSize })}
          >
            重置
          </Button>
        </Space>
      </Form>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={data}
        expandable={{
          expandedRowRender: (record) => (
            <pre
              style={{
                margin: 0,
                padding: 12,
                background: '#f7f9f5',
                border: '1px solid #e2e8df',
                borderRadius: 6,
                fontSize: 12,
                maxHeight: 280,
                overflow: 'auto',
              }}
            >
              {record.detail ? JSON.stringify(record.detail, null, 2) : '无明细'}
            </pre>
          ),
          rowExpandable: (record) => record.detail !== null && record.detail !== undefined,
        }}
        pagination={{
          total,
          current: query.page,
          pageSize: query.pageSize,
          showSizeChanger: true,
          showTotal: (value) => `共 ${value} 条`,
          onChange: (page, pageSize) => setQuery((prev) => ({ ...prev, page, pageSize })),
        }}
        columns={[
          { title: '用户', dataIndex: ['user', 'username'], width: 120 },
          {
            title: '动作',
            dataIndex: 'action',
            width: 220,
            render: (value: string) => <Tag color={actionTone[value] || 'default'}>{value}</Tag>,
          },
          { title: '对象', dataIndex: 'targetType', width: 120 },
          { title: '对象 ID', dataIndex: 'targetId', width: 100 },
          { title: 'IP', dataIndex: 'ip', width: 140 },
          {
            title: '时间',
            dataIndex: 'createdAt',
            width: 180,
            render: (value: string) => dayjs(value).format('YYYY-MM-DD HH:mm:ss'),
          },
        ]}
      />
    </Card>
  );
}
