import type { Request, Response } from 'express';
import { createExcelReport, createWordReport, getStats } from '../services/report.service.js';
import { ok } from '../utils/response.js';

export async function statsController(_req: Request, res: Response) {
  return ok(res, await getStats());
}

export async function wordController(_req: Request, res: Response) {
  const buffer = await createWordReport();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', 'attachment; filename="content-security-report.docx"');
  return res.send(buffer);
}

export async function excelController(_req: Request, res: Response) {
  const buffer = await createExcelReport();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="content-security-report.xlsx"');
  return res.send(buffer);
}
