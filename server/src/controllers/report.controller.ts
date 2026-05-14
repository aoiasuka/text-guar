import type { Request, Response } from 'express';
import { createExcelReport, createWordReport, getStats } from '../services/report.service.js';
import { ok } from '../utils/response.js';

function fileStamp() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

export async function statsController(_req: Request, res: Response) {
  return ok(res, await getStats());
}

export async function wordController(_req: Request, res: Response) {
  const buffer = await createWordReport();
  const filename = `content-security-report-${fileStamp()}.docx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.send(buffer);
}

export async function excelController(_req: Request, res: Response) {
  const buffer = await createExcelReport();
  const filename = `content-security-report-${fileStamp()}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.send(buffer);
}
