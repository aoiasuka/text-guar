import { Button, Card, Col, Row, Skeleton, Space, Statistic } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';
import { reportApi } from '@/services/api.js';
import { useAuthStore } from '@/stores/useAuthStore.js';
import { RiskPieChart } from '@/components/RiskPieChart.js';
import { Permission } from '@/components/Permission.js';
import type { RiskLevel } from '@text-guard/shared';

const riskColor: Record<RiskLevel, string> = {
  low: '#52c41a',
  medium: '#faad14',
  high: '#f5222d',
};

const riskLabel: Record<RiskLevel, string> = {
  low: '低风险',
  medium: '中风险',
  high: '高风险',
};

export function ReportsPage() {
  const [stats, setStats] = useState<Awaited<ReturnType<typeof reportApi.stats>>>();
  const [downloading, setDownloading] = useState<'word' | 'excel' | null>(null);
  const token = useAuthStore((state) => state.token);

  useEffect(() => {
    reportApi.stats().then(setStats);
  }, []);

  const download = async (type: 'word' | 'excel') => {
    setDownloading(type);
    try {
      await reportApi.download(type, token);
    } finally {
      setDownloading(null);
    }
  };

  const slices: Array<{ label: string; value: number; color: string }> = (
    ['high', 'medium', 'low'] as RiskLevel[]
  ).map((level) => ({
    label: riskLabel[level],
    color: riskColor[level],
    value: stats?.riskDistribution?.find((item) => item.riskLevel === level)?._count ?? 0,
  }));

  return (
    <Space direction="vertical" size={16} className="full">
      <Row gutter={[16, 16]}>
        {[
          { title: '内容总数', value: stats?.totalContents ?? 0 },
          { title: '待审核', value: stats?.pending ?? 0 },
          { title: '高风险', value: stats?.highRisk ?? 0 },
          { title: '通过率', value: stats?.passRate ?? 0, suffix: '%' },
        ].map((item) => (
          <Col xs={24} md={6} key={item.title}>
            <Card>
              {stats ? <Statistic title={item.title} value={item.value} suffix={item.suffix} /> : <Skeleton.Input active />}
            </Card>
          </Col>
        ))}
      </Row>
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={12}>
          <Card title="风险等级分布" loading={!stats}>
            <RiskPieChart data={slices} />
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <Card
            title="导出报表"
            loading={!stats}
            extra={
              <Permission code="report:export">
                <Space>
                  <Button
                    icon={<DownloadOutlined />}
                    loading={downloading === 'word'}
                    onClick={() => download('word')}
                  >
                    Word 报告
                  </Button>
                  <Button
                    icon={<DownloadOutlined />}
                    loading={downloading === 'excel'}
                    onClick={() => download('excel')}
                  >
                    Excel 报表
                  </Button>
                </Space>
              </Permission>
            }
          >
            <Space direction="vertical" size={8} className="full">
              <div>
                <strong>Word 报告</strong>：聚合关键统计指标与最近 20 条高风险内容，便于定期上报。
              </div>
              <div>
                <strong>Excel 报表</strong>：导出全量内容明细（最多 5000 条），可用于离线复盘与归档。
              </div>
            </Space>
          </Card>
        </Col>
      </Row>
    </Space>
  );
}
