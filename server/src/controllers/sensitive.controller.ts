import type { Request, Response } from 'express';
import { SensitiveContextScope, SensitiveMatchType } from '@prisma/client';
import { z } from 'zod';
import {
  batchCreateSensitiveWords,
  batchDeleteSensitiveWords,
  batchUpdateEnabled,
  createSensitiveWord,
  deleteSensitiveWord,
  getSensitiveWord,
  listSensitiveWords,
  testSensitiveWord,
  updateSensitiveWord,
} from '../services/sensitive.service.js';
import { listEventsByWord } from '../services/detection-event.service.js';
import { validateUserPattern } from '../engine/regex-safe.js';
import { writeLog } from '../services/log.service.js';
import { ok } from '../utils/response.js';

const matchTypeEnum = z.nativeEnum(SensitiveMatchType);
const contextScopeEnum = z.nativeEnum(SensitiveContextScope);

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
    baseConfidence: z.number().min(0).max(1).default(1.0),
    variantMatch: z.boolean().default(true),
    contextScope: contextScopeEnum.default(SensitiveContextScope.strict),
    positiveSamples: z.array(z.string().max(500)).max(50).optional(),
    negativeSamples: z.array(z.string().max(500)).max(50).optional(),
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
      // 用 re2-wasm 安全编译预检（避免 ReDoS）
      const r = validateUserPattern(data.pattern);
      if (!r.ok) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['pattern'],
          message: r.reason,
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
export const eventsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

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
  writeLog({
    userId: req.user!.id,
    action: 'update_sensitive_word',
    targetType: 'sensitive_word',
    targetId: item.id,
    detail: { word: item.word, version: item.version },
    ip: req.ip,
  });
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

export async function detailController(req: Request, res: Response) {
  return ok(res, await getSensitiveWord(Number(req.params.id)));
}

export async function eventsController(req: Request, res: Response) {
  const id = Number(req.params.id);
  const query = req.query as unknown as { page: number; pageSize: number };
  return ok(res, await listEventsByWord(id, query.page, query.pageSize));
}

export async function testController(req: Request, res: Response) {
  const id = Number(req.params.id);
  const result = await testSensitiveWord(id);
  writeLog({
    userId: req.user!.id,
    action: 'test_sensitive_word',
    targetType: 'sensitive_word',
    targetId: id,
    detail: { passed: result.passed.length, failed: result.failed.length },
    ip: req.ip,
  });
  return ok(res, result);
}
