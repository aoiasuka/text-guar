import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

const HEADER = 'x-request-id';

export function requestId(req: Request, res: Response, next: NextFunction) {
  const incoming = req.headers[HEADER];
  const value = typeof incoming === 'string' && incoming.length > 0 ? incoming : randomUUID();
  req.requestId = value;
  res.setHeader('X-Request-Id', value);
  return next();
}
