import { Button, Card, Form, Input, Modal, Popconfirm, Select, Space, Switch, Table, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';
import { sensitiveApi } from '@/services/api.js';
import type { SensitiveWord } from '@/types/index.js';
import { RiskTag } from '@/components/RiskTag.js';

export function SensitiveWordsPage() {
  const [data, setData] = useState<SensitiveWord[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState({ page: 1, pageSize: 10 });
  const [editing, setEditing] = useState<SensitiveWord>();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const load = (params = query) => {
    sensitiveApi.list(params).then((result) => {
      setData(result.list);
      setTotal(result.total);
    });
  };

  useEffect(() => load(), []);

  return (
    <Card
      title="敏感词库"
      extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => {
        setEditing(undefined);
        form.resetFields();
        setOpen(true);
      }}>新增词条</Button>}
    >
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
          { title: '词条', dataIndex: 'word' },
          { title: '风险', dataIndex: 'riskLevel', render: (value) => <RiskTag level={value} /> },
          { title: '替换词', dataIndex: 'replacement' },
          { title: '分类', dataIndex: 'category' },
          {
            title: '启用',
            dataIndex: 'enabled',
            render: (value, record) => (
              <Switch checked={value} onChange={async (checked) => {
                await sensitiveApi.toggle(record.id, checked);
                load();
              }} />
            ),
          },
          {
            title: '操作',
            render: (_, record) => (
              <Space>
                <Button size="small" onClick={() => {
                  setEditing(record);
                  form.setFieldsValue(record);
                  setOpen(true);
                }}>编辑</Button>
                <Popconfirm title="确认删除？" onConfirm={async () => {
                  await sensitiveApi.remove(record.id);
                  load();
                }}>
                  <Button size="small" danger>删除</Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />
      <Modal
        title={editing ? '编辑敏感词' : '新增敏感词'}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={async (values) => {
            if (editing) await sensitiveApi.update(editing.id, values);
            else await sensitiveApi.create(values);
            message.success('已保存');
            setOpen(false);
            load();
          }}
        >
          <Form.Item name="word" label="词条" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="riskLevel" label="风险等级" rules={[{ required: true }]}>
            <Select options={[
              { value: 'low', label: '低风险' },
              { value: 'medium', label: '中风险' },
              { value: 'high', label: '高风险' },
            ]} />
          </Form.Item>
          <Form.Item name="replacement" label="替换词" initialValue="***">
            <Input />
          </Form.Item>
          <Form.Item name="category" label="分类" initialValue="默认">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
