import type { Request, Response } from 'express';
import { z } from 'zod';
import { changePassword, login, register } from '../services/auth.service.js';
import { writeLog } from '../services/log.service.js';
import { fail, ok } from '../utils/response.js';

export const loginSchema = z.object({
  username: z.string().min(1, '请输入用户名'),
  password: z.string().min(1, '请输入密码'),
});

export const registerSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(6),
  role: z.enum(['admin', 'editor']).default('editor'),
});

export const passwordSchema = z.object({
  oldPassword: z.string().min(1),
  newPassword: z.string().min(6),
});

export async function loginController(req: Request, res: Response) {
  const result = await login(req.body.username, req.body.password);
  if (!result) return fail(res, 401, '用户名或密码错误');
  writeLog({
    userId: result.user.id,
    action: 'login',
    targetType: 'user',
    targetId: result.user.id,
    ip: req.ip,
  });
  return ok(res, result);
}

export async function registerController(req: Request, res: Response) {
  const user = await register(req.body);
  writeLog({
    userId: req.user!.id,
    action: 'register_user',
    targetType: 'user',
    targetId: user.id,
    detail: { username: user.username, role: user.role },
    ip: req.ip,
  });
  return ok(res, user);
}

export function profileController(req: Request, res: Response) {
  return ok(res, req.user);
}

export async function passwordController(req: Request, res: Response) {
  const changed = await changePassword(req.user!.id, req.body.oldPassword, req.body.newPassword);
  if (!changed) return fail(res, 400, '旧密码错误');
  return ok(res, true, '密码已更新');
}
