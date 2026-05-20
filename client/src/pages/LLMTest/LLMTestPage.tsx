import {
  Alert,
  Button,
  Card,
  Col,
  Collapse,
  Descriptions,
  Empty,
  Row,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  ApiOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExperimentOutlined,
  RobotOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useCallback, useEffect, useState } from 'react';
import { llmApi } from '@/services/api.js';
import type { LLMHealth, LLMJudgeTrace, LLMTestResult } from '@/types/index.js';
import { DetectResult } from '@/components/DetectResult.js';
import { HighlightedText } from '@/components/HighlightedText.js';

const PRESETS: Array<{ label: string; text: string; expect: string }> = [
  {
    label: '中性提及（攻击力）',
    text: '这款游戏角色攻击力很强，但操作难度也大。',
    expect: '期望：触发字面命中"攻击"（confidence=1.0），AI 复核判 neutral 后降权到 0.3 被丢弃',
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

const verdictTone: Record<string, string> = {
  sensitive: 'red',
  neutral: 'default',
  quote: 'blue',
  reverse: 'green',
};
const verdictLabel: Record<string, string> = {
  sensitive: '确认敏感',
  neutral: '中性',
  quote: '引用',
  reverse: '反向',
};

export function LLMTestPage() {
  const [health, setHealth] = useState<LLMHealth>();
  const [healthLoading, setHealthLoading] = useState(false);
  const [text, setText] = useState<string>(PRESETS[0].text);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<LLMTestResult | null>(null);

  const loadHealth = useCallback(() => {
    setHealthLoading(true);
    llmApi
      .health()
      .then(setHealth)
      .catch(() => undefined)
      .finally(() => setHealthLoading(false));
  }, []);

  useEffect(() => {
    loadHealth();
  }, [loadHealth]);

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

  const renderHealthCard = () => {
    if (!health) return <Empty description="加载 LLM 健康状态..." />;
    const ok = health.enabled && health.reachable && health.modelInstalled;
    const partial = health.reachable && !health.modelInstalled;
    return (
      <Alert
        type={ok ? 'success' : partial ? 'warning' : 'error'}
        showIcon
        message={
          <Space>
            {health.enabled ? (
              ok ? (
                <>
                  <CheckCircleOutlined /> LLM 已启用且连通
                </>
              ) : (
                <>
                  <CloseCircleOutlined /> LLM 已启用但不可用
                </>
              )
            ) : (
              <>
                <CloseCircleOutlined /> LLM 未启用
              </>
            )}
          </Space>
        }
        description={
          <Descriptions size="small" column={2}>
            <Descriptions.Item label="是否启用">
              <Tag color={health.enabled ? 'green' : 'default'}>
                {health.enabled ? 'true' : 'false (设 LLM_JUDGE_ENABLED=true)'}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Ollama 可达">
              <Tag color={health.reachable ? 'green' : 'red'}>
                {health.reachable ? `OK (${health.latencyMs}ms)` : `FAIL: ${health.error || '未知'}`}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="目标模型">
              <Tag color="purple">{health.model}</Tag>
              {health.reachable && (
                <Tag color={health.modelInstalled ? 'green' : 'red'}>
                  {health.modelInstalled ? '已安装' : `未 pull (跑 ollama pull ${health.model})`}
                </Tag>
              )}
            </Descriptions.Item>
            <Descriptions.Item label="Ollama Host">
              <code>{health.host}</code>
            </Descriptions.Item>
            {health.reachable && (
              <Descriptions.Item label="本机已装模型" span={2}>
                {health.availableModels.length ? (
                  <Space wrap>
                    {health.availableModels.map((m) => (
                      <Tag key={m} color={m === health.model ? 'purple' : 'default'}>
                        {m}
                      </Tag>
                    ))}
                  </Space>
                ) : (
                  <Typography.Text type="secondary">无</Typography.Text>
                )}
              </Descriptions.Item>
            )}
          </Descriptions>
        }
      />
    );
  };

  const renderTraces = (traces: LLMJudgeTrace[]) => {
    if (!traces.length) {
      return (
        <Empty
          description={
            <Space direction="vertical" size={4}>
              <Typography.Text>本次检测未触发任何 LLM 调用</Typography.Text>
              <Typography.Text type="secondary">
                可能原因：LLM 未启用 / 所有命中的置信度都在 [0.5, 0.85) 之外 / 全部命中击中缓存（看 fromCache）
              </Typography.Text>
            </Space>
          }
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      );
    }
    return (
      <Table
        size="small"
        rowKey={(_, idx) => String(idx)}
        dataSource={traces}
        pagination={false}
        columns={[
          { title: '#', width: 40, render: (_, __, idx) => idx + 1 },
          { title: '命中词', dataIndex: 'word', render: (v: string) => <code>{v}</code> },
          { title: '类别', dataIndex: 'category', width: 110 },
          {
            title: '状态',
            width: 90,
            render: (_, row) => {
              if (row.fromCache) return <Tag color="blue">缓存</Tag>;
              if (!row.ok) return <Tag color="red">失败</Tag>;
              return <Tag color="green">OK</Tag>;
            },
          },
          {
            title: 'verdict',
            dataIndex: 'verdict',
            width: 100,
            render: (v: string | undefined, row) => {
              if (!row.ok) return <Tag color="default">未判定</Tag>;
              return v ? <Tag color={verdictTone[v]}>{verdictLabel[v] || v}</Tag> : '—';
            },
          },
          {
            title: '耗时',
            dataIndex: 'durationMs',
            width: 90,
            render: (v: number) => `${v} ms`,
          },
          {
            title: 'HTTP',
            dataIndex: 'httpStatus',
            width: 70,
            render: (v: number | undefined) => v ?? '—',
          },
          {
            title: '理由 / 错误',
            render: (_, row) => (
              <Typography.Text type={row.ok ? undefined : 'danger'} style={{ fontSize: 12 }}>
                {row.errorMessage || row.reason || '—'}
              </Typography.Text>
            ),
          },
        ]}
        expandable={{
          expandedRowRender: (row: LLMJudgeTrace) => (
            <Space direction="vertical" size={4} style={{ width: '100%' }}>
              <Typography.Text strong>Prompt 预览（上下文片段）：</Typography.Text>
              <pre style={preStyle}>{row.promptPreview}</pre>
              {row.rawResponse && (
                <>
                  <Typography.Text strong>原始响应：</Typography.Text>
                  <pre style={preStyle}>{row.rawResponse}</pre>
                </>
              )}
            </Space>
          ),
        }}
      />
    );
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
          <Button size="small" icon={<ApiOutlined />} loading={healthLoading} onClick={loadHealth}>
            重新探活
          </Button>
        }
      >
        {renderHealthCard()}
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
            <Col xs={24} md={6}>
              <Card>
                <Statistic
                  title="规则引擎耗时"
                  value={result.timing.baselineMs}
                  suffix="ms"
                  prefix={<ThunderboltOutlined />}
                />
              </Card>
            </Col>
            <Col xs={24} md={6}>
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
            <Col xs={24} md={6}>
              <Card>
                <Statistic
                  title="LLM 调用次数"
                  value={result.llm.tracesCount}
                  valueStyle={{ color: result.llm.tracesCount > 0 ? '#722ed1' : '#bbb' }}
                />
              </Card>
            </Col>
            <Col xs={24} md={6}>
              <Card>
                <Statistic
                  title="LLM 改写命中数"
                  value={result.llm.judgedCount}
                  suffix={`/ 共 ${result.enhanced.matches.length}`}
                />
              </Card>
            </Col>
          </Row>

          <Card
            title={
              <Space>
                <RobotOutlined style={{ color: '#722ed1' }} />
                <span>AI 调用日志（traces）</span>
                <Tag color="purple">{result.traces.length} 次</Tag>
              </Space>
            }
          >
            {result.llm.enabled ? (
              renderTraces(result.traces)
            ) : (
              <Alert
                type="warning"
                showIcon
                message="LLM 未启用，不会触发 Ollama 调用"
                description={
                  <Typography.Text>
                    在 <code>server/.env</code> 设 <code>LLM_JUDGE_ENABLED=true</code> 并重启后端。
                  </Typography.Text>
                }
              />
            )}
          </Card>

          <Card
            title={
              <Space>
                <span>高亮原文</span>
                <Tag color="blue">{result.enhanced.matches.length} 项命中</Tag>
                {result.llm.judgedCount > 0 && (
                  <Tag color="purple">AI 改写 {result.llm.judgedCount} 次</Tag>
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

          <Collapse
            items={[
              {
                key: 'baseline',
                label: '规则引擎结果（未经 AI 复核）',
                children: <DetectResult result={result.baseline} />,
              },
            ]}
          />

          <Card
            title={
              <Space>
                <span>最终结果（含 AI 复核）</span>
                {!result.llm.enabled && <Tag>LLM 未启用，与规则引擎一致</Tag>}
              </Space>
            }
          >
            <DetectResult result={result.enhanced} />
            {result.llm.enabled && result.enhanced.matches.length > 0 && (
              <Alert
                style={{ marginTop: 12 }}
                type="info"
                showIcon
                message="置信度全链路 & AI 复核语义"
                description={
                  <Space direction="vertical" size={6}>
                    <Typography.Text strong>两段置信度：</Typography.Text>
                    <Typography.Text>
                      ·「规则置信度」= 规则引擎匹配后，经反绕过折扣、上下文消歧后的初始评分；
                    </Typography.Text>
                    <Typography.Text>
                      ·「最终置信度」= 若 AI 介入则按 verdict 改写，否则等于规则置信度。
                    </Typography.Text>
                    <Typography.Text>
                      AI 复核启用时，每条命中（confidence ≥ 0.5，未被规则层过滤的）都会送 AI 判定，每次检测最多并发 {result.llm.tracesCount} 条；超出按规则置信度降序优先复核。
                    </Typography.Text>
                    <Typography.Text strong style={{ marginTop: 8 }}>verdict 改写规则：</Typography.Text>
                    <Space wrap>
                      <Tag color="red">sensitive</Tag>
                      <Typography.Text>→ 最终置信度 = max(规则值, 0.9)，AI 确认风险</Typography.Text>
                    </Space>
                    <Space wrap>
                      <Tag color="default">neutral</Tag>
                      <Tag color="blue">quote</Tag>
                      <Tag color="green">reverse</Tag>
                      <Typography.Text>→ 最终置信度 = 规则值 × 0.3，多数会被阈值丢弃</Typography.Text>
                    </Space>
                    <Typography.Text strong style={{ marginTop: 8 }}>来源标签：</Typography.Text>
                    <Typography.Text>
                      <Tag color="volcano">字面</Tag>+<Tag color="purple">+AI</Tag> 表示该命中由字面规则触发、并经过 AI 复核改写；表格鼠标悬停到「来源」或「置信度」可看完整链路。
                    </Typography.Text>
                    <Typography.Text type="secondary" style={{ marginTop: 8 }}>
                      ⚠ 本地小模型（gemma4:e2b）的判定不一定准确，建议把 AI 结论当作"参考意见"而非"最终裁决"。
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

const preStyle: React.CSSProperties = {
  margin: 0,
  padding: 8,
  background: '#f7f9f5',
  border: '1px solid #e2e8df',
  borderRadius: 4,
  fontSize: 12,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-all',
};
