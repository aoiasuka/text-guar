import { Button, Card, Form, Input, Modal, Popconfirm, Space, Table, Tag, message } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { reviewApi } from '@/services/api.js';
import type { Content } from '@/types/index.js';
import { RiskTag } from '@/components/RiskTag.js';

const REJECT_TEMPLATES = [
  '正文存在违规表述，请修订后重新提交。',
  '存在敏感词命中，请使用建议替换或删除。',
  '内容信息不完整，缺少必要的背景说明。',
  '不符合本平台发布规范。',
];

export function ReviewListPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<Content[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selected, setSelected] = useState<number[]>([]);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectComment, setRejectComment] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await reviewApi.pending({ page, pageSize });
      setData(result.list);
      setTotal(result.total);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize]);

  useEffect(() => {
    setSelected([]);
    void load();
  }, [load]);

  const runBatchApprove = async () => {
    if (selected.length === 0) return;
    const result = await reviewApi.batch(selected, 'approve');
    if (result.skipped.length > 0) {
      message.warning(`通过 ${result.count} 项，跳过 ${result.skipped.length} 项（非待审核）`);
    } else {
      message.success(`已通过 ${result.count} 项`);
    }
    setSelected([]);
    load();
  };

  const submitBatchReject = async () => {
    if (selected.length === 0) return;
    const result = await reviewApi.batch(selected, 'reject', rejectComment || undefined);
    message.success(`已驳回 ${result.count} 项`);
    setRejectOpen(false);
    setRejectComment('');
    setSelected([]);
    load();
  };

  return (
    <Card
      title="审核工作台"
      extra={<Button icon={<ReloadOutlined />} onClick={load} />}
    >
      {selected.length > 0 && (
        <Space className="toolbar" wrap>
          <Tag color="processing">已选 {selected.length} 项</Tag>
          <Popconfirm title={`确认批量通过 ${selected.length} 项？`} onConfirm={runBatchApprove}>
            <Button type="primary" size="small">
              批量通过
            </Button>
          </Popconfirm>
          <Button size="small" danger onClick={() => setRejectOpen(true)}>
            批量驳回
          </Button>
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
          current: page,
          pageSize,
          showSizeChanger: true,
          showTotal: (value) => `共 ${value} 条`,
          onChange: (next, size) => {
            setPage(next);
            setPageSize(size);
          },
        }}
        columns={[
          { title: '标题', dataIndex: 'title' },
          { title: '作者', dataIndex: ['author', 'username'], width: 120 },
          { title: '分类', dataIndex: 'category', width: 120 },
          { title: '风险', dataIndex: 'riskLevel', render: (value) => <RiskTag level={value} />, width: 110 },
          { title: '风险分', dataIndex: 'riskScore', width: 90 },
          {
            title: '提交时间',
            dataIndex: 'updatedAt',
            render: (value) => dayjs(value).format('YYYY-MM-DD HH:mm'),
            width: 180,
          },
          {
            title: '操作',
            width: 130,
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

      <Modal
        title={`批量驳回 ${selected.length} 项`}
        open={rejectOpen}
        onCancel={() => {
          setRejectOpen(false);
          setRejectComment('');
        }}
        onOk={submitBatchReject}
        okButtonProps={{ danger: true }}
        okText="确认驳回"
        destroyOnClose
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Form.Item label="审核意见" style={{ marginBottom: 0 }}>
            <Input.TextArea
              rows={4}
              maxLength={500}
              showCount
              value={rejectComment}
              onChange={(e) => setRejectComment(e.target.value)}
              placeholder="可选：填写统一驳回理由"
            />
          </Form.Item>
          <Space wrap>
            {REJECT_TEMPLATES.map((tpl) => (
              <Tag
                key={tpl}
                style={{ cursor: 'pointer' }}
                onClick={() => setRejectComment(tpl)}
              >
                {tpl}
              </Tag>
            ))}
          </Space>
        </Space>
      </Modal>
    </Card>
  );
}
