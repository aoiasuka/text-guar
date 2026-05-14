import type { Request, Response } from 'express';
import { z } from 'zod';
import { listLogs } from '../services/log.service.js';
import { ok } from '../utils/response.js';

export const logQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(10),
  action: z.string().optional(),
  userId: z.coerce.number().int().positive().optional(),
  targetType: z.string().optional(),
  startAt: z.coerce.date().optional(),
  endAt: z.coerce.date().optional(),
});

export async function listController(req: Request, res: Response) {
  return ok(res, await listLogs(req.query as never));
}
