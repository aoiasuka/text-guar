import { Button, Card, Form, Input, Popconfirm, Select, Space, Table, message } from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { contentApi } from '@/services/api.js';
import type { Content } from '@/types/index.js';
import { RiskTag } from '@/components/RiskTag.js';
import { StatusTag } from '@/components/StatusTag.js';

export function ContentListPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<Content[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState({ page: 1, pageSize: 10 });

  const load = (params = query) => {
    contentApi.list(params).then((result) => {
      setData(result.list);
      setTotal(result.total);
    });
  };

  useEffect(() => load(), []);

  return (
    <Card
      title="内容管理"
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => load()} />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/contents/create')}>
            新建内容
          </Button>
        </Space>
      }
    >
      <Form
        layout="inline"
        className="toolbar"
        onFinish={(values) => {
          const next = { ...query, ...values, page: 1 };
          setQuery(next);
          load(next);
        }}
      >
        <Form.Item name="keyword">
          <Input.Search placeholder="标题或正文" allowClear />
        </Form.Item>
        <Form.Item name="status">
          <Select
            placeholder="状态"
            allowClear
            style={{ width: 140 }}
            options={[
              { value: 'draft', label: '草稿' },
              { value: 'pending', label: '待审核' },
              { value: 'published', label: '已发布' },
              { value: 'rejected', label: '已驳回' },
            ]}
          />
        </Form.Item>
        <Form.Item name="riskLevel">
          <Select
            placeholder="风险"
            allowClear
            style={{ width: 140 }}
            options={[
              { value: 'low', label: '低风险' },
              { value: 'medium', label: '中风险' },
              { value: 'high', label: '高风险' },
            ]}
          />
        </Form.Item>
        <Button htmlType="submit" type="primary">
          筛选
        </Button>
      </Form>
      <Table
        rowKey="id"
        dataSource={data}
        pagination={{
          total,
          current: query.page,
          pageSize: query.pageSize,
          onChange: (page, pageSize) => {
            const next = { ...query, page, pageSize };
            setQuery(next);
            load(next);
          },
        }}
        columns={[
          { title: '标题', dataIndex: 'title' },
          { title: '分类', dataIndex: 'category', width: 100 },
          { title: '作者', dataIndex: ['author', 'username'], width: 100 },
          { title: '状态', dataIndex: 'status', render: (value) => <StatusTag status={value} />, width: 100 },
          { title: '风险', dataIndex: 'riskLevel', render: (value) => <RiskTag level={value} />, width: 110 },
          { title: '风险分', dataIndex: 'riskScore', width: 90 },
          { title: '更新时间', dataIndex: 'updatedAt', render: (value) => dayjs(value).format('MM-DD HH:mm'), width: 130 },
          {
            title: '操作',
            width: 260,
            render: (_, record) => (
              <Space>
                <Button size="small" onClick={() => navigate(`/contents/${record.id}`)}>
                  预览
                </Button>
                <Button size="small" onClick={() => navigate(`/contents/${record.id}/edit`)}>
                  编辑
                </Button>
                <Button size="small" onClick={async () => {
                  const result = await contentApi.submit(record.id);
                  if (result.rejected) {
                    message.warning('检测为高风险，已自动驳回');
                  } else {
                    message.success('已提交审核');
                  }
                  load();
                }}>
                  提审
                </Button>
                <Popconfirm title="确认删除？" onConfirm={async () => {
                  await contentApi.remove(record.id);
                  load();
                }}>
                  <Button size="small" danger>删除</Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />
    </Card>
  );
}
