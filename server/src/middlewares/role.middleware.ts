import type { NextFunction, Request, Response } from 'express';
import type { Role } from '@text-guard/shared';
import { fail } from '../utils/response.js';

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return fail(res, 403, '权限不足');
    }
    return next();
  };
}
