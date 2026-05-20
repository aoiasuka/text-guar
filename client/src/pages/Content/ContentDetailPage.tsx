import { Button, Card, Descriptions, Divider, Space, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { contentApi } from '@/services/api.js';
import type { Content } from '@/types/index.js';
import { DetectResult } from '@/components/DetectResult.js';
import { HighlightedText } from '@/components/HighlightedText.js';
import { RiskTag } from '@/components/RiskTag.js';
import { StatusTag } from '@/components/StatusTag.js';
import { Permission } from '@/components/Permission.js';

export function ContentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [content, setContent] = useState<Content>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    contentApi
      .detail(Number(id))
      .then(setContent)
      .finally(() => setLoading(false));
  }, [id]);

  if (!content) {
    return (
      <Card loading={loading}>
        <Typography.Text type="secondary">加载中...</Typography.Text>
      </Card>
    );
  }

  return (
    <Space direction="vertical" size={16} className="full">
      <Card
        title={content.title}
        extra={
          <Space>
            <Permission code="content:update">
              <Button onClick={() => navigate(`/contents/${content.id}/edit`)}>编辑</Button>
            </Permission>
            <Button onClick={() => navigate('/contents')}>返回</Button>
          </Space>
        }
      >
        <Descriptions size="small" column={3}>
          <Descriptions.Item label="分类">{content.category}</Descriptions.Item>
          <Descriptions.Item label="作者">{content.author.username}</Descriptions.Item>
          <Descriptions.Item label="状态"><StatusTag status={content.status} /></Descriptions.Item>
          <Descriptions.Item label="风险"><RiskTag level={content.riskLevel} /></Descriptions.Item>
          <Descriptions.Item label="风险分">{content.riskScore}</Descriptions.Item>
          <Descriptions.Item label="更新时间">{dayjs(content.updatedAt).format('YYYY-MM-DD HH:mm')}</Descriptions.Item>
        </Descriptions>
        <Divider />
        <Typography.Title level={5}>原文（命中区域已高亮）</Typography.Title>
        <HighlightedText
          text={content.body}
          matches={content.detectionResult?.matches}
          className="preview"
        />
        <Typography.Title level={5}>过滤预览</Typography.Title>
        <pre className="preview filtered">{content.filteredBody}</pre>
      </Card>
      <DetectResult result={content.detectionResult} />
    </Space>
  );
}
