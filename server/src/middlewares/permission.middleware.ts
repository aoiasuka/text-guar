import type { NextFunction, Request, Response } from 'express';
import { fail } from '../utils/response.js';
import { getDataScope, hasAllPermissions } from '../services/permission.service.js';

export function requirePermission(...codes: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return fail(res, 401, '未授权');
    if (codes.length === 0) return next();
    try {
      const allowed = await hasAllPermissions(req.user.role, codes);
      if (!allowed) return fail(res, 403, '权限不足');
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

export function dataScope(module: 'content' | 'log') {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return fail(res, 401, '未授权');
    try {
      const scope = await getDataScope(req.user.role, module);
      if (!scope) return fail(res, 403, '无数据访问权限');
      req.dataScope = { scope, ownerId: req.user.id };
      return next();
    } catch (error) {
      return next(error);
    }
  };
}
