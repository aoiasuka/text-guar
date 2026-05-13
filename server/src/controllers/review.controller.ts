import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  approveContent,
  listPendingReviews,
  listReviewHistory,
  rejectContent,
} from '../services/review.service.js';
import { writeLog } from '../services/log.service.js';
import { ok } from '../utils/response.js';

export const reviewQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(10),
});

export const reviewBodySchema = z.object({ comment: z.string().max(500).optional() });

export async function pendingController(req: Request, res: Response) {
  const query = req.query as unknown as { page: number; pageSize: number };
  return ok(res, await listPendingReviews(query.page, query.pageSize));
}

export async function historyController(req: Request, res: Response) {
  const query = req.query as unknown as { page: number; pageSize: number };
  return ok(res, await listReviewHistory(query.page, query.pageSize));
}

export async function approveController(req: Request, res: Response) {
  const content = await approveContent(Number(req.params.contentId), req.user!.id, req.body.comment);
  await writeLog({
    userId: req.user!.id,
    action: 'approve_content',
    targetType: 'content',
    targetId: content.id,
    detail: { comment: req.body.comment },
    ip: req.ip,
  });
  return ok(res, content);
}

export async function rejectController(req: Request, res: Response) {
  const content = await rejectContent(Number(req.params.contentId), req.user!.id, req.body.comment);
  await writeLog({
    userId: req.user!.id,
    action: 'reject_content',
    targetType: 'content',
    targetId: content.id,
    detail: { comment: req.body.comment },
    ip: req.ip,
  });
  return ok(res, content);
}
