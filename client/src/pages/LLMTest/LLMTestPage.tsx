import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Row,
  Space,
  Statistic,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  ApiOutlined,
  ExperimentOutlined,
  RobotOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useCallback, useEffect, useState } from 'react';
import { llmApi } from '@/services/api.js';
import type { LLMStatus, LLMTestResult } from '@/types/index.js';
import { DetectResult } from '@/components/DetectResult.js';
import { HighlightedText } from '@/components/HighlightedText.js';

const PRESETS: Array<{ label: string; text: string; expect: string }> = [
  {
    label: '中性提及（攻击力）',
    text: '这款游戏角色攻击力很强，但操作难度也大。',
    expect: '期望：触发字面命中"攻击"，但 jieba 复合词降权 + AI 复核 neutral，最终被丢弃',
  },
  {
    label: '反向劝阻',
    text: '反诈宣传：请勿沉迷赌博，远离暴力。',
    expect: '期望：命中"赌博""暴力"但触发 reverse 降权，AI 复核 reverse',
  },
  {
    label: '引用他人言论',
    text: '他在朋友圈写：「最近迷上赌博了」，结果被警察叫去喝茶。',
    expect: '期望：「赌博」位于引号内 + AI 复核 quote，最终被丢弃',
  },
  {
    label: '凭证组合（admin/admin123）',
    text: '运维同事临时把测试环境密码改成 admin/admin123，记得明早改回去。',
    expect: '期望：credential 规则命中"admin/admin123"，AI 复核 sensitive 拉高置信度',
  },
  {
    label: 'AWS Key 泄漏',
    text: 'Hardcoded credential found: AKIAIOSFODNN7EXAMPLE in commit.',
    expect: '期望：credential.aws_access_key 规则命中，高风险',
  },
  {
    label: '拼音绕过',
    text: '别DUBO了，输的倾家荡产，攴击别人也没用。',
    expect: '期望：literal_variant 通过拼音命中赌博，形近字命中攻击',
  },
  {
    label: '代码块包裹',
    text: '错误日志示例：\n```\n[INFO] 测试敏感词 触发了规则 X\n```\n属于演示文本。',
    expect: '期望：代码块内命中被降权 ×0.3 → 丢弃',
  },
];

function verdictColor(v: string): string {
  switch (v) {
    case 'sensitive':
      return 'red';
    case 'neutral':
      return 'default';
    case 'quote':
      return 'blue';
    case 'reverse':
      return 'green';
    default:
      return 'default';
  }
}

const verdictLabel: Record<string, string> = {
  sensitive: '确认敏感',
  neutral: '中性',
  quote: '引用',
  reverse: '反向',
};

export function LLMTestPage() {
  const [status, setStatus] = useState<LLMStatus>();
  const [text, setText] = useState<string>(PRESETS[0].text);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<LLMTestResult | null>(null);

  const loadStatus = useCallback(() => {
    llmApi.status().then(setStatus).catch(() => undefined);
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const run = async () => {
    if (!text.trim()) {
      message.warning('请输入待检测文本');
      return;
    }
    setRunning(true);
    try {
      const r = await llmApi.test(text);
      setResult(r);
    } finally {
      setRunning(false);
    }
  };

  return (
    <Space direction="vertical" size={16} className="full">
      <Card
        title={
          <Space>
            <RobotOutlined />
            <span>AI 复核测试</span>
          </Space>
        }
        extra={
          <Button size="small" icon={<ApiOutlined />} onClick={loadStatus}>
            刷新状态
          </Button>
        }
      >
        {status ? (
          status.enabled ? (
            <Alert
              type="success"
              showIcon
              message="LLM 已启用"
              description={
                <Descriptions size="small" column={2}>
                  <Descriptions.Item label="模型">
                    <Tag color="purple">{status.model}</Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="Ollama Host">
                    <code>{status.host}</code>
                  </Descriptions.Item>
                  <Descriptions.Item label="单次最多判定">{status.maxPerDetection} 条</Descriptions.Item>
                  <Descriptions.Item label="超时">{status.timeoutMs} ms</Descriptions.Item>
                </Descriptions>
              }
            />
          ) : (
            <Alert
              type="warning"
              showIcon
              message="LLM 未启用"
              description={
                <Space direction="vertical">
                  <Typography.Text>
                    当前 <code>LLM_JUDGE_ENABLED=false</code>。仅展示规则引擎结果，不调用 AI 复核。
                  </Typography.Text>
                  <Typography.Text type="secondary">
                    启用方式：在 <code>server/.env</code> 设 <code>LLM_JUDGE_ENABLED=true</code>，并确保
                    Ollama 已安装且 <code>{status.model}</code> 模型已 pull。
                  </Typography.Text>
                </Space>
              }
            />
          )
        ) : (
          <Empty description="加载 LLM 状态..." />
        )}
      </Card>

      <Card title="演示样本（点击填入）">
        <Space wrap>
          {PRESETS.map((p) => (
            <Button key={p.label} size="small" onClick={() => setText(p.text)}>
              {p.label}
            </Button>
          ))}
        </Space>
      </Card>

      <Card title="待检测文本">
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            style={{
              width: '100%',
              padding: 12,
              fontSize: 14,
              fontFamily: 'inherit',
              border: '1px solid #d9d9d9',
              borderRadius: 4,
              resize: 'vertical',
            }}
            placeholder="粘贴或输入要检测的文本（≤4000 字）"
          />
          <Space>
            <Button
              type="primary"
              icon={<ExperimentOutlined />}
              loading={running}
              onClick={run}
            >
              执行检测
            </Button>
            <Typography.Text type="secondary">
              将完整跑一次：规则匹配 → 上下文消歧 → 置信度评分 → AI 复核
            </Typography.Text>
          </Space>
        </Space>
      </Card>

      {result && (
        <>
          <Row gutter={[16, 16]}>
            <Col xs={24} md={8}>
              <Card>
                <Statistic
                  title="规则引擎耗时"
                  value={result.timing.baselineMs}
                  suffix="ms"
                  prefix={<ThunderboltOutlined />}
                />
              </Card>
            </Col>
            <Col xs={24} md={8}>
              <Card>
                <Statistic
                  title="AI 复核额外耗时"
                  value={result.timing.llmOverheadMs}
                  suffix="ms"
                  prefix={<RobotOutlined />}
                  valueStyle={{ color: result.llm.enabled ? '#722ed1' : '#bbb' }}
                />
              </Card>
            </Col>
            <Col xs={24} md={8}>
              <Card>
                <Statistic
                  title="LLM 实际判定命中数"
                  value={result.llm.judgedCount}
                  suffix={`/ 共 ${result.enhanced.matches.length}`}
                  valueStyle={{ color: result.llm.judgedCount > 0 ? '#722ed1' : '#bbb' }}
                />
              </Card>
            </Col>
          </Row>

          <Card
            title={
              <Space>
                <span>高亮原文</span>
                <Tag color="blue">{result.enhanced.matches.length} 项命中</Tag>
                {result.llm.judgedCount > 0 && (
                  <Tag color="purple">AI 复核 {result.llm.judgedCount} 次</Tag>
                )}
              </Space>
            }
          >
            <HighlightedText
              text={text}
              matches={result.enhanced.matches}
              className="preview"
            />
          </Card>

          <Card title="规则引擎结果（未经 AI 复核）">
            <DetectResult result={result.baseline} />
          </Card>

          <Card
            title={
              <Space>
                <span>最终结果（含 AI 复核）</span>
                {!result.llm.enabled && <Tag>LLM 未启用，与上方一致</Tag>}
              </Space>
            }
          >
            <DetectResult result={result.enhanced} />
            {result.llm.enabled && result.enhanced.matches.length > 0 && (
              <Alert
                style={{ marginTop: 12 }}
                type="info"
                showIcon
                message="说明"
                description={
                  <Space direction="vertical" size={4}>
                    <Typography.Text>
                      AI 仅对置信度 ∈ [0.5, 0.85) 的命中进行二次判定，最多 {status?.maxPerDetection ?? 3} 条/次。
                    </Typography.Text>
                    <Typography.Text>
                      verdict 含义：
                      {(['sensitive', 'neutral', 'quote', 'reverse'] as const).map((v) => (
                        <Tag key={v} color={verdictColor(v)} style={{ marginLeft: 8 }}>
                          {verdictLabel[v]}
                        </Tag>
                      ))}
                    </Typography.Text>
                    <Typography.Text>
                      <Tag color="red">sensitive</Tag> 拉高置信度到 ≥0.9；其它三种将置信度 × 0.3 → 低于阈值的会被丢弃。
                    </Typography.Text>
                  </Space>
                }
              />
            )}
          </Card>
        </>
      )}
    </Space>
  );
}
