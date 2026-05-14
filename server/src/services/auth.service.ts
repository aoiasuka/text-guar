import bcrypt from 'bcryptjs';
import type { Role } from '@text-guard/shared';
import { prisma } from '../utils/prisma.js';
import { signToken } from '../utils/jwt.js';
import { HttpError } from '../utils/errors.js';

export async function login(username: string, password: string) {
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) return null;

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return null;

  const profile = {
    id: user.id,
    username: user.username,
    role: user.role as Role,
    createdAt: user.createdAt.toISOString(),
  };

  return { token: signToken(profile), user: profile };
}

export async function register(input: { username: string; password: string; role: Role }) {
  const existing = await prisma.user.findUnique({ where: { username: input.username } });
  if (existing) throw new HttpError(409, '用户名已存在');
  const passwordHash = await bcrypt.hash(input.password, 10);
  const user = await prisma.user.create({
    data: { username: input.username, passwordHash, role: input.role },
  });
  return { id: user.id, username: user.username, role: user.role, createdAt: user.createdAt };
}

export async function changePassword(userId: number, oldPassword: string, newPassword: string) {
  if (oldPassword === newPassword) {
    throw new HttpError(400, '新密码不能与旧密码相同');
  }
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const valid = await bcrypt.compare(oldPassword, user.passwordHash);
  if (!valid) return false;

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await bcrypt.hash(newPassword, 10) },
  });
  return true;
}
