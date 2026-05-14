import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  createContent,
  deleteContent,
  detectText,
  getContent,
  listContents,
  pinContent,
  submitContent,
  updateContent,
} from '../services/content.service.js';
import { writeLog } from '../services/log.service.js';
import { ok } from '../utils/response.js';

export const pageQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(10),
  status: z.enum(['draft', 'pending', 'published', 'rejected']).optional(),
  riskLevel: z.enum(['low', 'medium', 'high']).optional(),
  category: z.string().optional(),
  keyword: z.string().optional(),
});

export const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

export const contentSchema = z.object({
  title: z.string().min(1, '请输入标题').max(200),
  body: z.string().min(1, '请输入正文'),
  category: z.string().max(50).default('默认'),
});

export const detectSchema = z.object({ text: z.string().min(1) });
export const pinSchema = z.object({ isPinned: z.boolean() });

export async function listController(req: Request, res: Response) {
  return ok(res, await listContents(req.query as never));
}

export async function detailController(req: Request, res: Response) {
  return ok(res, await getContent(Number(req.params.id)));
}

export async function createController(req: Request, res: Response) {
  const content = await createContent({ ...req.body, authorId: req.user!.id });
  writeLog({
    userId: req.user!.id,
    action: 'create_content',
    targetType: 'content',
    targetId: content.id,
    detail: { title: content.title },
    ip: req.ip,
  });
  return ok(res, content);
}

export async function updateController(req: Request, res: Response) {
  const content = await updateContent(Number(req.params.id), req.body);
  writeLog({
    userId: req.user!.id,
    action: 'update_content',
    targetType: 'content',
    targetId: content.id,
    ip: req.ip,
  });
  return ok(res, content);
}

export async function deleteController(req: Request, res: Response) {
  const id = Number(req.params.id);
  await deleteContent(id);
  writeLog({
    userId: req.user!.id,
    action: 'delete_content',
    targetType: 'content',
    targetId: id,
    ip: req.ip,
  });
  return ok(res, true);
}

export async function submitController(req: Request, res: Response) {
  const id = Number(req.params.id);
  const result = await submitContent(id);
  writeLog({
    userId: req.user!.id,
    action: result.rejected ? 'submit_content_rejected_by_detector' : 'submit_content',
    targetType: 'content',
    targetId: id,
    detail: result.detection,
    ip: req.ip,
  });
  return ok(res, result);
}

export async function pinController(req: Request, res: Response) {
  const content = await pinContent(Number(req.params.id), req.body.isPinned);
  return ok(res, content);
}

export async function detectController(req: Request, res: Response) {
  return ok(res, await detectText(req.body.text));
}
