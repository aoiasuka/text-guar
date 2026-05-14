import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { HttpError } from '../utils/errors.js';
import { fail } from '../utils/response.js';

export function notFoundHandler(req: Request, res: Response) {
  return fail(res, 404, `路径不存在：${req.originalUrl}`);
}

export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (error instanceof HttpError) {
    return fail(res, error.status, error.message, error.details ?? null);
  }

  if (error instanceof ZodError) {
    return fail(res, 400, error.issues[0]?.message || '参数错误', error.issues);
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') return fail(res, 409, '记录已存在');
    if (error.code === 'P2025') return fail(res, 404, '记录不存在');
    if (error.code === 'P2003') return fail(res, 400, '存在关联记录');
    return fail(res, 400, `数据库错误：${error.code}`);
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    return fail(res, 400, '数据校验失败');
  }

  const reqIdSuffix = req.requestId ? ` reqId=${req.requestId}` : '';
  console.error(`[Unhandled]${reqIdSuffix}`, error);
  const message = error instanceof Error ? error.message : '服务器内部错误';
  return fail(res, 500, message);
}
