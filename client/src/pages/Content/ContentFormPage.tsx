import { Alert, Button, Card, Form, Input, Space, Typography, message } from 'antd';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import type { DetectionResult } from '@text-guard/shared';
import { contentApi } from '@/services/api.js';
import { DetectResult } from '@/components/DetectResult.js';
import { HighlightedText } from '@/components/HighlightedText.js';
import { useDebouncedValue } from '@/hooks/useDebouncedValue.js';

interface DraftSnapshot {
  title?: string;
  body?: string;
  category?: string;
  savedAt: string;
}

const draftKey = (id?: string) => `text-guard:draft:${id ?? 'new'}`;

function readDraft(id?: string): DraftSnapshot | undefined {
  try {
    const raw = window.localStorage.getItem(draftKey(id));
    if (!raw) return undefined;
    return JSON.parse(raw) as DraftSnapshot;
  } catch {
    return undefined;
  }
}

function writeDraft(id: string | undefined, value: DraftSnapshot) {
  try {
    window.localStorage.setItem(draftKey(id), JSON.stringify(value));
  } catch {
    // ignore quota errors
  }
}

function clearDraft(id?: string) {
  try {
    window.localStorage.removeItem(draftKey(id));
  } catch {
    // ignore
  }
}

export function ContentFormPage() {
  const [form] = Form.useForm();
  const { id } = useParams();
  const navigate = useNavigate();
  const [result, setResult] = useState<DetectionResult>();
  const [bodyText, setBodyText] = useState('');
  const [titleText, setTitleText] = useState('');
  const [categoryText, setCategoryText] = useState('默认');
  const [detecting, setDetecting] = useState(false);
  const [draftRestoredAt, setDraftRestoredAt] = useState<string | undefined>();
  const initialized = useRef(false);

  const debouncedBody = useDebouncedValue(bodyText, 600);

  // Load remote content or restored draft when the route id changes
  useEffect(() => {
    const hydrate = async () => {
      let initial: { title: string; body: string; category: string } = {
        title: '',
        body: '',
        category: '默认',
      };

      if (id) {
        const content = await contentApi.detail(Number(id));
        initial = {
          title: content.title,
          body: content.body,
          category: content.category || '默认',
        };
        setResult(content.detectionResult);
      } else {
        setResult(undefined);
      }

      const draft = readDraft(id);
      if (draft) {
        initial = {
          title: draft.title ?? initial.title,
          body: draft.body ?? initial.body,
          category: draft.category ?? initial.category,
        };
        setDraftRestoredAt(draft.savedAt);
      } else {
        setDraftRestoredAt(undefined);
      }

      form.setFieldsValue(initial);
      setTitleText(initial.title);
      setBodyText(initial.body);
      setCategoryText(initial.category);
      initialized.current = true;
    };

    initialized.current = false;
    void hydrate();
  }, [id, form]);

  // Persist draft on input changes
  useEffect(() => {
    if (!initialized.current) return;
    if (!titleText && !bodyText) return;
    writeDraft(id, {
      title: titleText,
      body: bodyText,
      category: categoryText,
      savedAt: new Date().toISOString(),
    });
  }, [id, titleText, bodyText, categoryText]);

  // Debounced live detection
  useEffect(() => {
    if (!debouncedBody) {
      setResult(undefined);
      return;
    }
    let active = true;
    setDetecting(true);
    contentApi
      .detect(debouncedBody)
      .then((res) => {
        if (active) setResult(res);
      })
      .finally(() => {
        if (active) setDetecting(false);
      });
    return () => {
      active = false;
    };
  }, [debouncedBody]);

  const submit = useCallback(
    async (values: { title: string; body: string; category: string }) => {
      const content = id
        ? await contentApi.update(Number(id), values)
        : await contentApi.create(values);
      message.success('保存成功');
      clearDraft(id);
      navigate(`/contents/${content.id}`);
    },
    [id, navigate],
  );

  const previewMatches = useMemo(() => result?.matches ?? [], [result]);

  const discardDraft = () => {
    clearDraft(id);
    setDraftRestoredAt(undefined);
    message.info('已清除本地草稿');
  };

  return (
    <Space direction="vertical" size={16} className="full">
      <Card
        title={id ? '编辑内容' : '新建内容'}
        extra={
          detecting ? (
            <Typography.Text type="secondary">正在实时检测…</Typography.Text>
          ) : (
            <Typography.Text type="secondary">输入停顿后自动检测</Typography.Text>
          )
        }
      >
        {draftRestoredAt && (
          <Alert
            style={{ marginBottom: 12 }}
            type="info"
            showIcon
            message={`已恢复未保存草稿（${dayjs(draftRestoredAt).format('MM-DD HH:mm')}）`}
            action={
              <Button size="small" onClick={discardDraft}>
                清除草稿
              </Button>
            }
          />
        )}
        <Form form={form} layout="vertical" onFinish={submit}>
          <Form.Item name="title" label="标题" rules={[{ required: true }]}>
            <Input maxLength={200} onChange={(e) => setTitleText(e.target.value)} />
          </Form.Item>
          <Form.Item name="category" label="分类" initialValue="默认">
            <Input maxLength={50} onChange={(e) => setCategoryText(e.target.value)} />
          </Form.Item>
          <Form.Item name="body" label="正文" rules={[{ required: true }]}>
            <Input.TextArea
              rows={12}
              showCount
              onChange={(e) => setBodyText(e.target.value)}
            />
          </Form.Item>
          <Space>
            <Button type="primary" htmlType="submit">
              保存
            </Button>
            <Button onClick={() => navigate('/contents')}>返回</Button>
          </Space>
        </Form>
      </Card>
      {bodyText && previewMatches.length > 0 && (
        <Card title="命中预览（高亮）" size="small">
          <HighlightedText text={bodyText} matches={previewMatches} className="preview" />
        </Card>
      )}
      <DetectResult result={result} />
    </Space>
  );
}
