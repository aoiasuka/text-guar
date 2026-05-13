import type { Response } from 'express';

export function ok<T>(res: Response, data: T, message = 'success') {
  return res.json({ code: 200, message, data });
}

export function created<T>(res: Response, data: T, message = 'created') {
  return res.status(201).json({ code: 201, message, data });
}

export function fail(res: Response, code: number, message: string, data: unknown = null) {
  return res.status(code).json({ code, message, data });
}
