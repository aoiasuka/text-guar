import { Button, Card, Descriptions, Input, Modal, Space, Typography, message } from 'antd';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { contentApi, reviewApi } from '@/services/api.js';
import type { Content } from '@/types/index.js';
import { DetectResult } from '@/components/DetectResult.js';
import { RiskTag } from '@/components/RiskTag.js';

export function ReviewDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [content, setContent] = useState<Content>();
  const [comment, setComment] = useState('');

  useEffect(() => {
    if (id) contentApi.detail(Number(id)).then(setContent);
  }, [id]);

  const finish = async (action: 'approve' | 'reject') => {
    if (!content) return;
    if (action === 'approve') await reviewApi.approve(content.id, comment);
    else await reviewApi.reject(content.id, comment);
    message.success(action === 'approve' ? '已通过' : '已驳回');
    navigate('/review');
  };

  if (!content) return null;

  return (
    <Space direction="vertical" size={16} className="full">
      <Card title="审核详情">
        <Descriptions column={3}>
          <Descriptions.Item label="标题">{content.title}</Descriptions.Item>
          <Descriptions.Item label="作者">{content.author.username}</Descriptions.Item>
          <Descriptions.Item label="风险"><RiskTag level={content.riskLevel} /></Descriptions.Item>
        </Descriptions>
        <Typography.Title level={5}>正文</Typography.Title>
        <pre className="preview">{content.body}</pre>
        <Typography.Title level={5}>审核意见</Typography.Title>
        <Input.TextArea rows={4} value={comment} onChange={(event) => setComment(event.target.value)} />
        <Space className="actions">
          <Button type="primary" onClick={() => finish('approve')}>通过</Button>
          <Button danger onClick={() => Modal.confirm({ title: '确认驳回？', onOk: () => finish('reject') })}>
            驳回
          </Button>
          <Button onClick={() => navigate('/review')}>返回</Button>
        </Space>
      </Card>
      <DetectResult result={content.detectionResult} />
    </Space>
  );
}
