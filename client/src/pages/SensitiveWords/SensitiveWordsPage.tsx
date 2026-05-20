import { Button, Card, Form, Input, Modal, Popconfirm, Select, Space, Switch, Table, Tag, message } from 'antd';
import { DeleteOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { useCallback, useEffect, useState } from 'react';
import { sensitiveApi } from '@/services/api.js';
import type { SensitiveMatchType, SensitiveWord } from '@/types/index.js';
import { RiskTag } from '@/components/RiskTag.js';
import { Permission } from '@/components/Permission.js';
import { usePermission } from '@/hooks/usePermission.js';

interface ListQuery {
  page: number;
  pageSize: number;
  keyword?: string;
  riskLevel?: 'low' | 'medium' | 'high';
  enabled?: boolean;
  matchType?: SensitiveMatchType;
}

const matchTypeOptions = [
  { value: 'literal', label: '字面匹配' },
  { value: 'regex', label: '正则匹配' },
  { value: 'credential', label: '凭证识别' },
];

const matchTypeColor: Record<SensitiveMatchType, string> = {
  literal: 'default',
  regex: 'geekblue',
  credential: 'magenta',
};

const matchTypeLabel: Record<SensitiveMatchType, string> = {
  literal: '字面',
  regex: '正则',
  credential: '凭证',
};

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
  const [formMatchType, setFormMatchType] = useState<SensitiveMatchType>('literal');
  const perm = usePermission();

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
          <Permission code="sensitive:create">
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                setEditing(undefined);
                form.resetFields();
                form.setFieldsValue({ matchType: 'literal', replacement: '***', category: '默认' });
                setFormMatchType('literal');
                setOpen(true);
              }}
            >
              新增词条
            </Button>
          </Permission>
        </Space>
      }
    >
      <Form
        form={filterForm}
        layout="inline"
        className="toolbar"
        onFinish={(values: {
          keyword?: string;
          riskLevel?: ListQuery['riskLevel'];
          enabled?: string;
          matchType?: SensitiveMatchType;
        }) => {
          let enabled: boolean | undefined;
          if (values.enabled === 'true') enabled = true;
          else if (values.enabled === 'false') enabled = false;
          setQuery({
            page: 1,
            pageSize: query.pageSize,
            keyword: values.keyword || undefined,
            riskLevel: values.riskLevel,
            enabled,
            matchType: values.matchType,
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
        <Form.Item name="matchType">
          <Select placeholder="匹配模式" allowClear style={{ width: 140 }} options={matchTypeOptions} />
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
          <Permission code="sensitive:toggle">
            <Button size="small" onClick={() => runBatchToggle(true)}>
              批量启用
            </Button>
            <Button size="small" onClick={() => runBatchToggle(false)}>
              批量禁用
            </Button>
          </Permission>
          <Permission code="sensitive:delete">
            <Popconfirm title={`确认删除选中的 ${selected.length} 项？`} onConfirm={runBatchDelete}>
              <Button size="small" danger icon={<DeleteOutlined />}>
                批量删除
              </Button>
            </Popconfirm>
          </Permission>
          <Button size="small" type="link" onClick={() => setSelected([])}>
            取消选择
          </Button>
        </Space>
      )}

      <Table
        rowKey="id"
        dataSource={data}
        loading={loading}
        rowSelection={
          perm.hasAny('sensitive:toggle', 'sensitive:delete')
            ? {
                selectedRowKeys: selected,
                onChange: (keys) => setSelected(keys.map(Number)),
              }
            : undefined
        }
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
            title: '匹配模式',
            dataIndex: 'matchType',
            width: 100,
            render: (value: SensitiveMatchType) => (
              <Tag color={matchTypeColor[value]}>{matchTypeLabel[value]}</Tag>
            ),
          },
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
                disabled={!perm.has('sensitive:toggle')}
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
                <Permission code="sensitive:update">
                  <Button
                    size="small"
                    onClick={() => {
                      setEditing(record);
                      form.setFieldsValue(record);
                      setFormMatchType(record.matchType);
                      setOpen(true);
                    }}
                  >
                    编辑
                  </Button>
                </Permission>
                <Permission code="sensitive:delete">
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
                </Permission>
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
            if (values.matchType !== 'regex') values.pattern = undefined;
            if (editing) await sensitiveApi.update(editing.id, values);
            else await sensitiveApi.create(values);
            message.success('已保存');
            setOpen(false);
            refresh();
          }}
        >
          <Form.Item name="word" label="词条/规则名" rules={[{ required: true, message: '请输入词条' }]}>
            <Input maxLength={200} />
          </Form.Item>
          <Form.Item
            name="matchType"
            label="匹配模式"
            rules={[{ required: true }]}
            initialValue="literal"
          >
            <Select
              options={matchTypeOptions}
              onChange={(value) => setFormMatchType(value)}
            />
          </Form.Item>
          {formMatchType === 'regex' && (
            <Form.Item
              name="pattern"
              label="正则表达式"
              rules={[
                { required: true, message: '请输入正则表达式' },
                {
                  validator: async (_, value) => {
                    if (!value) return;
                    try {
                      const body = String(value).replace(/^\(\?[imsu]+\)/, '');
                      new RegExp(body);
                    } catch (error) {
                      throw new Error(`正则不合法：${error instanceof Error ? error.message : ''}`);
                    }
                  },
                },
              ]}
              extra="支持前置 (?i)/(?s) 等内联 flag；统一以全局模式扫描。"
            >
              <Input.TextArea rows={2} maxLength={500} placeholder="例如：(?i)password\s*[:=]\s*(?:admin|123456)" />
            </Form.Item>
          )}
          {formMatchType === 'credential' && (
            <Form.Item label=" " colon={false}>
              <Tag color="magenta">凭证识别</Tag>
              <span style={{ color: '#888' }}>
                将使用内置的「账号+密码组合」规则识别（如 admin/admin123、password=xxx 等），无需填正则。
              </span>
            </Form.Item>
          )}
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
