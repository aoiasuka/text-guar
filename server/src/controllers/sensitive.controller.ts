import type { Request, Response } from 'express';
import { SensitiveMatchType } from '@prisma/client';
import { z } from 'zod';
import {
  batchCreateSensitiveWords,
  batchDeleteSensitiveWords,
  batchUpdateEnabled,
  createSensitiveWord,
  deleteSensitiveWord,
  listSensitiveWords,
  updateSensitiveWord,
} from '../services/sensitive.service.js';
import { writeLog } from '../services/log.service.js';
import { ok } from '../utils/response.js';

const matchTypeEnum = z.nativeEnum(SensitiveMatchType);

export const sensitiveQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(10),
  keyword: z.string().optional(),
  riskLevel: z.enum(['low', 'medium', 'high']).optional(),
  enabled: z.coerce.boolean().optional(),
  matchType: matchTypeEnum.optional(),
});

export const sensitiveSchema = z
  .object({
    word: z.string().min(1).max(200),
    matchType: matchTypeEnum.default(SensitiveMatchType.literal),
    pattern: z.string().max(500).optional(),
    riskLevel: z.enum(['low', 'medium', 'high']),
    replacement: z.string().max(100).default('***'),
    category: z.string().max(50).default('默认'),
  })
  .superRefine((data, ctx) => {
    if (data.matchType === SensitiveMatchType.regex) {
      if (!data.pattern || !data.pattern.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['pattern'],
          message: '正则模式下 pattern 必填',
        });
        return;
      }
      try {
        const body = data.pattern.replace(/^\(\?[imsu]+\)/, '');
        new RegExp(body);
      } catch (error) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['pattern'],
          message: `正则不合法：${error instanceof Error ? error.message : '未知错误'}`,
        });
      }
    }
  });

export const batchSchema = z.object({ items: z.array(sensitiveSchema).min(1) });
export const toggleSchema = z.object({ enabled: z.boolean() });
export const batchIdsSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(500),
});
export const batchToggleSchema = batchIdsSchema.extend({ enabled: z.boolean() });

export async function listController(req: Request, res: Response) {
  return ok(res, await listSensitiveWords(req.query as never));
}

export async function createController(req: Request, res: Response) {
  const item = await createSensitiveWord(req.body);
  writeLog({
    userId: req.user!.id,
    action: 'create_sensitive_word',
    targetType: 'sensitive_word',
    targetId: item.id,
    detail: { word: item.word, matchType: item.matchType, riskLevel: item.riskLevel },
    ip: req.ip,
  });
  return ok(res, item);
}

export async function batchController(req: Request, res: Response) {
  const result = await batchCreateSensitiveWords(req.body.items);
  writeLog({
    userId: req.user!.id,
    action: 'batch_create_sensitive_word',
    targetType: 'sensitive_word',
    detail: { count: result.count },
    ip: req.ip,
  });
  return ok(res, result);
}

export async function updateController(req: Request, res: Response) {
  const item = await updateSensitiveWord(Number(req.params.id), req.body);
  return ok(res, item);
}

export async function toggleController(req: Request, res: Response) {
  const item = await updateSensitiveWord(Number(req.params.id), { enabled: req.body.enabled });
  return ok(res, item);
}

export async function deleteController(req: Request, res: Response) {
  const id = Number(req.params.id);
  await deleteSensitiveWord(id);
  writeLog({
    userId: req.user!.id,
    action: 'delete_sensitive_word',
    targetType: 'sensitive_word',
    targetId: id,
    ip: req.ip,
  });
  return ok(res, true);
}

export async function batchToggleController(req: Request, res: Response) {
  const result = await batchUpdateEnabled(req.body.ids, req.body.enabled);
  writeLog({
    userId: req.user!.id,
    action: req.body.enabled ? 'batch_enable_sensitive_word' : 'batch_disable_sensitive_word',
    targetType: 'sensitive_word',
    detail: { count: result.count, ids: req.body.ids },
    ip: req.ip,
  });
  return ok(res, result);
}

export async function batchDeleteController(req: Request, res: Response) {
  const result = await batchDeleteSensitiveWords(req.body.ids);
  writeLog({
    userId: req.user!.id,
    action: 'batch_delete_sensitive_word',
    targetType: 'sensitive_word',
    detail: { count: result.count, ids: req.body.ids },
    ip: req.ip,
  });
  return ok(res, result);
}
