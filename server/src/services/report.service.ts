import * as docx from 'docx';
import ExcelJS from 'exceljs';
import { prisma } from '../utils/prisma.js';

const { Document, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } =
  docx as Record<string, any>;

const STATS_TTL_MS = 30_000;
const EXCEL_MAX_ROWS = 5000;
let statsCache: { value: Awaited<ReturnType<typeof computeStats>>; expireAt: number } | undefined;

async function computeStats() {
  const [totalContents, pending, published, rejected, highRisk, reviews, recentLogs] =
    await Promise.all([
      prisma.content.count(),
      prisma.content.count({ where: { status: 'pending' } }),
      prisma.content.count({ where: { status: 'published' } }),
      prisma.content.count({ where: { status: 'rejected' } }),
      prisma.content.count({ where: { riskLevel: 'high' } }),
      prisma.review.count(),
      prisma.operationLog.findMany({
        include: { user: { select: { username: true } } },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

  const riskDistribution = await prisma.content.groupBy({
    by: ['riskLevel'],
    _count: true,
    where: { riskLevel: { not: null } },
  });

  return {
    totalContents,
    pending,
    published,
    rejected,
    highRisk,
    reviews,
    passRate: reviews ? Math.round((published / reviews) * 100) : 0,
    riskDistribution,
    recentLogs,
  };
}

export async function getStats(options: { force?: boolean } = {}) {
  const now = Date.now();
  if (!options.force && statsCache && statsCache.expireAt > now) {
    return statsCache.value;
  }
  const value = await computeStats();
  statsCache = { value, expireAt: now + STATS_TTL_MS };
  return value;
}

export function invalidateStatsCache() {
  statsCache = undefined;
}

export async function createWordReport() {
  const stats = await getStats();
  const highRisk = await prisma.content.findMany({
    where: { riskLevel: 'high' },
    select: {
      id: true,
      title: true,
      status: true,
      riskScore: true,
      updatedAt: true,
      author: { select: { username: true } },
    },
    orderBy: { updatedAt: 'desc' },
    take: 20,
  });

  const rows = highRisk.map(
    (item) =>
      new TableRow({
        children: [
          new TableCell({ children: [new Paragraph(item.title)] }),
          new TableCell({ children: [new Paragraph(item.author.username)] }),
          new TableCell({ children: [new Paragraph(String(item.riskScore))] }),
          new TableCell({ children: [new Paragraph(item.status)] }),
        ],
      }),
  );

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            children: [new TextRun({ text: '内容安全审核报告', bold: true, size: 36 })],
          }),
          new Paragraph(`生成时间：${new Date().toLocaleString('zh-CN')}`),
          new Paragraph(`内容总数：${stats.totalContents}`),
          new Paragraph(`待审核：${stats.pending}，已发布：${stats.published}，已驳回：${stats.rejected}`),
          new Paragraph(`高风险内容：${stats.highRisk}`),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: ['标题', '作者', '风险分', '状态'].map(
                  (text) => new TableCell({ children: [new Paragraph(text)] }),
                ),
              }),
              ...rows,
            ],
          }),
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}

export async function createExcelReport() {
  const stats = await getStats();
  const totalRows = await prisma.content.count();
  const contents = await prisma.content.findMany({
    select: {
      id: true,
      title: true,
      category: true,
      status: true,
      riskLevel: true,
      riskScore: true,
      createdAt: true,
      author: { select: { username: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: EXCEL_MAX_ROWS,
  });

  const workbook = new ExcelJS.Workbook();
  const summary = workbook.addWorksheet('审核统计');
  summary.addRows([
    ['指标', '数量'],
    ['内容总数', stats.totalContents],
    ['待审核', stats.pending],
    ['已发布', stats.published],
    ['已驳回', stats.rejected],
    ['高风险', stats.highRisk],
    ['本次导出条数', contents.length],
    ['是否截断', totalRows > EXCEL_MAX_ROWS ? `是（最多 ${EXCEL_MAX_ROWS} 条）` : '否'],
  ]);

  const sheet = workbook.addWorksheet('内容明细');
  sheet.columns = [
    { header: 'ID', key: 'id', width: 8 },
    { header: '标题', key: 'title', width: 30 },
    { header: '作者', key: 'author', width: 14 },
    { header: '分类', key: 'category', width: 14 },
    { header: '状态', key: 'status', width: 12 },
    { header: '风险等级', key: 'riskLevel', width: 12 },
    { header: '风险分', key: 'riskScore', width: 10 },
    { header: '创建时间', key: 'createdAt', width: 24 },
  ];
  sheet.getRow(1).font = { bold: true };
  contents.forEach((item) =>
    sheet.addRow({
      id: item.id,
      title: item.title,
      author: item.author.username,
      category: item.category,
      status: item.status,
      riskLevel: item.riskLevel,
      riskScore: item.riskScore,
      createdAt: item.createdAt.toLocaleString('zh-CN'),
    }),
  );

  return workbook.xlsx.writeBuffer();
}
