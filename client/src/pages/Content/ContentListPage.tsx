import { Button, Card, Form, Input, Popconfirm, Select, Space, Table, message } from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { contentApi } from '@/services/api.js';
import type { Content } from '@/types/index.js';
import { RiskTag } from '@/components/RiskTag.js';
import { StatusTag } from '@/components/StatusTag.js';

const STATUS_VALUES = ['draft', 'pending', 'published', 'rejected'] as const;
const RISK_VALUES = ['low', 'medium', 'high'] as const;

type StatusValue = (typeof STATUS_VALUES)[number];
type RiskValue = (typeof RISK_VALUES)[number];

interface ListQuery {
  page: number;
  pageSize: number;
  keyword?: string;
  status?: StatusValue;
  riskLevel?: RiskValue;
}

function parseQuery(params: URLSearchParams): ListQuery {
  const page = Number(params.get('page')) || 1;
  const pageSize = Number(params.get('pageSize')) || 10;
  const keyword = params.get('keyword') || undefined;
  const statusRaw = params.get('status');
  const riskRaw = params.get('riskLevel');
  const status = STATUS_VALUES.find((s) => s === statusRaw);
  const riskLevel = RISK_VALUES.find((r) => r === riskRaw);
  return { page, pageSize, keyword, status, riskLevel };
}

function buildSearch(query: ListQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.page > 1) params.set('page', String(query.page));
  if (query.pageSize !== 10) params.set('pageSize', String(query.pageSize));
  if (query.keyword) params.set('keyword', query.keyword);
  if (query.status) params.set('status', query.status);
  if (query.riskLevel) params.set('riskLevel', query.riskLevel);
  return params;
}

export function ContentListPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [form] = Form.useForm();
  const [data, setData] = useState<Content[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const query = useMemo(() => parseQuery(searchParams), [searchParams]);

  const updateQuery = useCallback(
    (patch: Partial<ListQuery>) => {
      const next = { ...query, ...patch };
      setSearchParams(buildSearch(next));
    },
    [query, setSearchParams],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await contentApi.list(query as unknown as Record<string, unknown>);
      setData(result.list);
      setTotal(result.total);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    form.setFieldsValue({
      keyword: query.keyword,
      status: query.status,
      riskLevel: query.riskLevel,
    });
    void load();
  }, [query, form, load]);

  return (
    <Card
      title="内容管理"
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={load} />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/contents/create')}>
            新建内容
          </Button>
        </Space>
      }
    >
      <Form
        form={form}
        layout="inline"
        className="toolbar"
        onFinish={(values) =>
          updateQuery({
            page: 1,
            keyword: values.keyword || undefined,
            status: values.status,
            riskLevel: values.riskLevel,
          })
        }
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
        <Space>
          <Button htmlType="submit" type="primary">
            筛选
          </Button>
          <Button
            onClick={() => {
              form.resetFields();
              setSearchParams(new URLSearchParams());
            }}
          >
            重置
          </Button>
        </Space>
      </Form>
      <Table
        rowKey="id"
        dataSource={data}
        loading={loading}
        pagination={{
          total,
          current: query.page,
          pageSize: query.pageSize,
          showSizeChanger: true,
          onChange: (page, pageSize) => updateQuery({ page, pageSize }),
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
                <Button
                  size="small"
                  onClick={async () => {
                    const result = await contentApi.submit(record.id);
                    if (result.rejected) {
                      message.warning('检测为高风险，已自动驳回');
                    } else {
                      message.success('已提交审核');
                    }
                    load();
                  }}
                >
                  提审
                </Button>
                <Popconfirm
                  title="确认删除？"
                  onConfirm={async () => {
                    await contentApi.remove(record.id);
                    load();
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
    </Card>
  );
}
