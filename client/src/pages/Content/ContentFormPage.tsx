import { Button, Card, Form, Input, Space, message } from 'antd';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { DetectionResult } from '@text-guard/shared';
import { contentApi } from '@/services/api.js';
import { DetectResult } from '@/components/DetectResult.js';

export function ContentFormPage() {
  const [form] = Form.useForm();
  const { id } = useParams();
  const navigate = useNavigate();
  const [result, setResult] = useState<DetectionResult>();

  useEffect(() => {
    if (id) {
      contentApi.detail(Number(id)).then((content) => {
        form.setFieldsValue(content);
        setResult(content.detectionResult);
      });
    }
  }, [id, form]);

  const detect = async () => {
    const body = form.getFieldValue('body');
    if (!body) return;
    setResult(await contentApi.detect(body));
  };

  return (
    <Space direction="vertical" size={16} className="full">
      <Card title={id ? '编辑内容' : '新建内容'}>
        <Form
          form={form}
          layout="vertical"
          onFinish={async (values) => {
            const content = id
              ? await contentApi.update(Number(id), values)
              : await contentApi.create(values);
            message.success('保存成功');
            navigate(`/contents/${content.id}`);
          }}
        >
          <Form.Item name="title" label="标题" rules={[{ required: true }]}>
            <Input maxLength={200} />
          </Form.Item>
          <Form.Item name="category" label="分类" initialValue="默认">
            <Input maxLength={50} />
          </Form.Item>
          <Form.Item name="body" label="正文" rules={[{ required: true }]}>
            <Input.TextArea rows={12} showCount />
          </Form.Item>
          <Space>
            <Button onClick={detect}>预检测</Button>
            <Button type="primary" htmlType="submit">
              保存
            </Button>
            <Button onClick={() => navigate('/contents')}>返回</Button>
          </Space>
        </Form>
      </Card>
      <DetectResult result={result} />
    </Space>
  );
}
