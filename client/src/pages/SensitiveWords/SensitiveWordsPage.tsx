import { Button, Card, Form, Input, Modal, Popconfirm, Select, Space, Switch, Table, Tag, message } from 'antd';
import { DeleteOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { useCallback, useEffect, useState } from 'react';
import { sensitiveApi } from '@/services/api.js';
import type { SensitiveWord } from '@/types/index.js';
import { RiskTag } from '@/components/RiskTag.js';

interface ListQuery {
  page: number;
  pageSize: number;
  keyword?: string;
  riskLevel?: 'low' | 'medium' | 'high';
  enabled?: boolean;
}

export function SensitiveWordsPage() {
  const [data, setData] = useState<SensitiveWord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState<ListQuery>({ page: 1, pageSize: 10 });
  const [selected, setSelected] = useState<number[]>([]);
  const [editing, setEditing] = useState<SensitiveWord>();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const [filterForm] = Form.useForm();

  const load = useCallback(
    async (params: ListQuery) => {
      setLoading(true);
      try {
        const result = await sensitiveApi.list(params as unknown as Record<string, unknown>);
        setData(result.list);
        setTotal(result.total);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    setSelected([]);
    void load(query);
  }, [query, load]);

  const refresh = () => load(query);

  const runBatchToggle = async (enabled: boolean) => {
    if (selected.length === 0) return;
    const result = await sensitiveApi.batchToggle(selected, enabled);
    message.success(`已${enabled ? '启用' : '禁用'} ${result.count} 项`);
    setSelected([]);
    refresh();
  };

  const runBatchDelete = async () => {
    if (selected.length === 0) return;
    const result = await sensitiveApi.batchRemove(selected);
    message.success(`已删除 ${result.count} 项`);
    setSelected([]);
    refresh();
  };

  return (
    <Card
      title="敏感词库"
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={refresh} />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditing(undefined);
              form.resetFields();
              setOpen(true);
            }}
          >
            新增词条
          </Button>
        </Space>
      }
    >
      <Form
        form={filterForm}
        layout="inline"
        className="toolbar"
        onFinish={(values: { keyword?: string; riskLevel?: ListQuery['riskLevel']; enabled?: string }) => {
          let enabled: boolean | undefined;
          if (values.enabled === 'true') enabled = true;
          else if (values.enabled === 'false') enabled = false;
          setQuery({
            page: 1,
            pageSize: query.pageSize,
            keyword: values.keyword || undefined,
            riskLevel: values.riskLevel,
            enabled,
          });
        }}
      >
        <Form.Item name="keyword">
          <Input.Search placeholder="词条关键字" allowClear style={{ width: 180 }} />
        </Form.Item>
        <Form.Item name="riskLevel">
          <Select
            placeholder="风险等级"
            allowClear
            style={{ width: 140 }}
            options={[
              { value: 'low', label: '低风险' },
              { value: 'medium', label: '中风险' },
              { value: 'high', label: '高风险' },
            ]}
          />
        </Form.Item>
        <Form.Item name="enabled">
          <Select
            placeholder="启用状态"
            allowClear
            style={{ width: 140 }}
            options={[
              { value: 'true', label: '已启用' },
              { value: 'false', label: '已禁用' },
            ]}
          />
        </Form.Item>
        <Space>
          <Button type="primary" htmlType="submit">
            筛选
          </Button>
          <Button
            onClick={() => {
              filterForm.resetFields();
              setQuery({ page: 1, pageSize: query.pageSize });
            }}
          >
            重置
          </Button>
        </Space>
      </Form>

      {selected.length > 0 && (
        <Space className="toolbar" wrap>
          <Tag color="processing">已选 {selected.length} 项</Tag>
          <Button size="small" onClick={() => runBatchToggle(true)}>
            批量启用
          </Button>
          <Button size="small" onClick={() => runBatchToggle(false)}>
            批量禁用
          </Button>
          <Popconfirm title={`确认删除选中的 ${selected.length} 项？`} onConfirm={runBatchDelete}>
            <Button size="small" danger icon={<DeleteOutlined />}>
              批量删除
            </Button>
          </Popconfirm>
          <Button size="small" type="link" onClick={() => setSelected([])}>
            取消选择
          </Button>
        </Space>
      )}

      <Table
        rowKey="id"
        dataSource={data}
        loading={loading}
        rowSelection={{
          selectedRowKeys: selected,
          onChange: (keys) => setSelected(keys.map(Number)),
        }}
        pagination={{
          total,
          current: query.page,
          pageSize: query.pageSize,
          showSizeChanger: true,
          onChange: (page, pageSize) => setQuery((prev) => ({ ...prev, page, pageSize })),
        }}
        columns={[
          { title: '词条', dataIndex: 'word' },
          {
            title: '风险',
            dataIndex: 'riskLevel',
            width: 100,
            render: (value) => <RiskTag level={value} />,
          },
          { title: '替换词', dataIndex: 'replacement', width: 140 },
          { title: '分类', dataIndex: 'category', width: 140 },
          {
            title: '启用',
            dataIndex: 'enabled',
            width: 90,
            render: (value, record) => (
              <Switch
                checked={value}
                onChange={async (checked) => {
                  await sensitiveApi.toggle(record.id, checked);
                  refresh();
                }}
              />
            ),
          },
          {
            title: '操作',
            width: 160,
            render: (_, record) => (
              <Space>
                <Button
                  size="small"
                  onClick={() => {
                    setEditing(record);
                    form.setFieldsValue(record);
                    setOpen(true);
                  }}
                >
                  编辑
                </Button>
                <Popconfirm
                  title="确认删除？"
                  onConfirm={async () => {
                    await sensitiveApi.remove(record.id);
                    refresh();
                  }}
                >
                  <Button size="small" danger>
                    删除
                  </Button>
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
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={async (values) => {
            if (editing) await sensitiveApi.update(editing.id, values);
            else await sensitiveApi.create(values);
            message.success('已保存');
            setOpen(false);
            refresh();
          }}
        >
          <Form.Item name="word" label="词条" rules={[{ required: true, message: '请输入词条' }]}>
            <Input maxLength={100} />
          </Form.Item>
          <Form.Item name="riskLevel" label="风险等级" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'low', label: '低风险' },
                { value: 'medium', label: '中风险' },
                { value: 'high', label: '高风险' },
              ]}
            />
          </Form.Item>
          <Form.Item name="replacement" label="替换词" initialValue="***">
            <Input maxLength={100} />
          </Form.Item>
          <Form.Item name="category" label="分类" initialValue="默认">
            <Input maxLength={50} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
