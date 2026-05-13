import { prisma } from '../utils/prisma.js';

export async function writeLog(input: {
  userId: number;
  action: string;
  targetType: string;
  targetId?: number;
  detail?: unknown;
  ip?: string;
}) {
  await prisma.operationLog.create({
    data: {
      userId: input.userId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      detail: input.detail ? JSON.stringify(input.detail) : undefined,
      ip: input.ip,
    },
  });
}

export async function listLogs(query: {
  page: number;
  pageSize: number;
  action?: string;
  userId?: number;
}) {
  const where = {
    action: query.action ? { contains: query.action } : undefined,
    userId: query.userId,
  };
  const [list, total] = await Promise.all([
    prisma.operationLog.findMany({
      where,
      include: { user: { select: { id: true, username: true, role: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.operationLog.count({ where }),
  ]);

  return { list, total, page: query.page, pageSize: query.pageSize };
}
