import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  List,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  message,
} from 'antd';
import {
  DeleteOutlined,
  ExperimentOutlined,
  HistoryOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { sensitiveApi, type SensitiveWordPayload } from '@/services/api.js';
import type { RuleTestResult, SensitiveContextScope, SensitiveMatchType, SensitiveWord } from '@/types/index.js';
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

const scopeOptions = [
  { value: 'strict', label: '严格（默认，启用全部上下文规则）' },
  { value: 'lenient', label: '宽松（只判定引号与代码块）' },
  { value: 'global', label: '全局（跳过所有上下文调整）' },
];

interface FormShape {
  word: string;
  matchType: SensitiveMatchType;
  pattern?: string;
  riskLevel: 'low' | 'medium' | 'high';
  replacement: string;
  category: string;
  baseConfidence: number;
  variantMatch: boolean;
  contextScope: SensitiveContextScope;
  positiveSamplesText?: string;
  negativeSamplesText?: string;
}

function samplesToText(raw: string | null | undefined): string {
  if (!raw) return '';
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.join('\n') : '';
  } catch {
    return '';
  }
}

function textToSamples(text: string | undefined): string[] | undefined {
  if (!text) return undefined;
  const arr = text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  return arr.length ? arr : undefined;
}

export function SensitiveWordsPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<SensitiveWord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState<ListQuery>({ page: 1, pageSize: 10 });
  const [selected, setSelected] = useState<number[]>([]);
  const [editing, setEditing] = useState<SensitiveWord>();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm<FormShape>();
  const [filterForm] = Form.useForm();
  const [formMatchType, setFormMatchType] = useState<SensitiveMatchType>('literal');
  const [testResult, setTestResult] = useState<RuleTestResult | null>(null);
  const [testOpen, setTestOpen] = useState(false);
  const [testingId, setTestingId] = useState<number | null>(null);
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

  const openCreate = () => {
    setEditing(undefined);
    form.resetFields();
    form.setFieldsValue({
      matchType: 'literal',
      replacement: '***',
      category: '默认',
      baseConfidence: 1,
      variantMatch: true,
      contextScope: 'strict',
    });
    setFormMatchType('literal');
    setOpen(true);
  };

  const openEdit = (record: SensitiveWord) => {
    setEditing(record);
    form.setFieldsValue({
      word: record.word,
      matchType: record.matchType,
      pattern: record.pattern ?? undefined,
      riskLevel: record.riskLevel,
      replacement: record.replacement,
      category: record.category,
      baseConfidence: record.baseConfidence,
      variantMatch: record.variantMatch,
      contextScope: record.contextScope,
      positiveSamplesText: samplesToText(record.positiveSamples),
      negativeSamplesText: samplesToText(record.negativeSamples),
    });
    setFormMatchType(record.matchType);
    setOpen(true);
  };

  const runTest = async (id: number) => {
    setTestingId(id);
    try {
      const r = await sensitiveApi.test(id);
      setTestResult(r);
      setTestOpen(true);
    } finally {
      setTestingId(null);
    }
  };

  return (
    <Card
      title="敏感词库"
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={refresh} />
          <Permission code="sensitive:create">
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
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
            title: '模式',
            dataIndex: 'matchType',
            width: 90,
            render: (value: SensitiveMatchType) => (
              <Tag color={matchTypeColor[value]}>{matchTypeLabel[value]}</Tag>
            ),
          },
          {
            title: '风险',
            dataIndex: 'riskLevel',
            width: 90,
            render: (value) => <RiskTag level={value} />,
          },
          { title: '替换', dataIndex: 'replacement', width: 110 },
          { title: '分类', dataIndex: 'category', width: 100 },
          {
            title: '置信度',
            dataIndex: 'baseConfidence',
            width: 90,
            render: (value: number) => `${Math.round((value ?? 1) * 100)}%`,
          },
          {
            title: '版本',
            dataIndex: 'version',
            width: 70,
            render: (value: number) => <Tag>v{value}</Tag>,
          },
          {
            title: '启用',
            dataIndex: 'enabled',
            width: 80,
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
            width: 240,
            render: (_, record) => (
              <Space wrap>
                <Permission code="sensitive:update">
                  <Button size="small" onClick={() => openEdit(record)}>
                    编辑
                  </Button>
                </Permission>
                <Permission code="sensitive:test">
                  <Tooltip title={record.positiveSamples || record.negativeSamples ? '运行 positive/negative 样本回归' : '该规则未配置样本'}>
                    <Button
                      size="small"
                      icon={<ExperimentOutlined />}
                      loading={testingId === record.id}
                      disabled={!record.positiveSamples && !record.negativeSamples}
                      onClick={() => runTest(record.id)}
                    >
                      测试
                    </Button>
                  </Tooltip>
                </Permission>
                <Permission code="sensitive:event:view">
                  <Button
                    size="small"
                    icon={<HistoryOutlined />}
                    onClick={() => navigate(`/sensitive-words/${record.id}/events`)}
                  >
                    审计
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
        title={editing ? `编辑敏感词 · v${editing.version}` : '新增敏感词'}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        destroyOnClose
        width={680}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={async (values: FormShape) => {
            const payload: SensitiveWordPayload = {
              word: values.word,
              matchType: values.matchType,
              pattern: values.matchType === 'regex' ? values.pattern : undefined,
              riskLevel: values.riskLevel,
              replacement: values.replacement,
              category: values.category,
              baseConfidence: values.baseConfidence,
              variantMatch: values.variantMatch,
              contextScope: values.contextScope,
              positiveSamples: textToSamples(values.positiveSamplesText),
              negativeSamples: textToSamples(values.negativeSamplesText),
            };
            if (editing) await sensitiveApi.update(editing.id, payload);
            else await sensitiveApi.create(payload);
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
            <Select options={matchTypeOptions} onChange={(value) => setFormMatchType(value)} />
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
                使用内置「账号+密码组合」规则识别（admin/admin123、password=xxx、「账号 xxx 密码 yyy」等）。
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
          <Space size={16} style={{ display: 'flex' }}>
            <Form.Item name="replacement" label="替换词" initialValue="***" style={{ flex: 1 }}>
              <Input maxLength={100} />
            </Form.Item>
            <Form.Item name="category" label="分类" initialValue="默认" style={{ flex: 1 }}>
              <Input maxLength={50} />
            </Form.Item>
          </Space>

          <Space size={16} style={{ display: 'flex' }}>
            <Form.Item
              name="baseConfidence"
              label="基础置信度"
              initialValue={1}
              extra="0-1。最终命中置信度 = 该值 × 来源折扣 × 上下文调整"
              style={{ flex: 1 }}
            >
              <InputNumber min={0} max={1} step={0.05} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              name="variantMatch"
              label="反绕过变体"
              initialValue
              valuePropName="checked"
              extra="启用后命中拼音/形近/leet 变体（置信度 ×0.75）"
              style={{ flex: 1 }}
            >
              <Switch />
            </Form.Item>
          </Space>

          <Form.Item
            name="contextScope"
            label="上下文判定范围"
            initialValue="strict"
            extra="strict 应用全部规则；lenient 仅引号/代码块；global 完全跳过"
          >
            <Select options={scopeOptions} />
          </Form.Item>

          <Form.Item
            name="positiveSamplesText"
            label="应命中样本（每行一条）"
            extra="用于规则测试，验证规则修改后仍能命中预期文本"
          >
            <Input.TextArea rows={3} placeholder="例如：&#10;他在赌博&#10;组织赌博活动" />
          </Form.Item>
          <Form.Item
            name="negativeSamplesText"
            label="不应命中样本（每行一条）"
            extra="用于回归测试，避免规则误伤"
          >
            <Input.TextArea rows={3} placeholder="例如：&#10;反诈骗宣传&#10;赌一把试试" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="规则测试结果"
        open={testOpen}
        onCancel={() => setTestOpen(false)}
        onOk={() => setTestOpen(false)}
        cancelButtonProps={{ style: { display: 'none' } }}
        destroyOnClose
        width={520}
      >
        {testResult && (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Alert
              type={testResult.failed.length === 0 ? 'success' : 'warning'}
              showIcon
              message={`通过 ${testResult.passed.length} 项 · 失败 ${testResult.failed.length} 项`}
            />
            {testResult.failed.length > 0 && (
              <List
                size="small"
                header={<strong>失败样本</strong>}
                dataSource={testResult.failed}
                renderItem={(item) => (
                  <List.Item>
                    <Space>
                      <Tag color="red">{item.expected ? '应命中却未命中' : '不应命中却命中'}</Tag>
                      <code>{item.sample}</code>
                    </Space>
                  </List.Item>
                )}
              />
            )}
            <List
              size="small"
              header={<strong>通过样本</strong>}
              dataSource={testResult.passed}
              renderItem={(item) => (
                <List.Item>
                  <Space>
                    <Tag color="green">{item.matched ? '✓ 命中' : '✓ 未命中（预期）'}</Tag>
                    <code>{item.sample}</code>
                  </Space>
                </List.Item>
              )}
            />
          </Space>
        )}
      </Modal>
    </Card>
  );
}
