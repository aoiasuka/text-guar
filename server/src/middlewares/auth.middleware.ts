import type { NextFunction, Request, Response } from 'express';
import { fail } from '../utils/response.js';
import { verifyToken } from '../utils/jwt.js';

export function auth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return fail(res, 401, '未授权');
  }

  try {
    req.user = verifyToken(header.slice(7));
    return next();
  } catch {
    return fail(res, 401, 'Token 无效或已过期');
  }
}
