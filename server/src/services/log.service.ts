import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma.js';

type LogInput = {
  userId: number;
  action: string;
  targetType: string;
  targetId?: number;
  detail?: unknown;
  ip?: string;
};

export function writeLog(input: LogInput) {
  prisma.operationLog
    .create({
      data: {
        userId: input.userId,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        detail: input.detail ? safeStringify(input.detail) : undefined,
        ip: input.ip,
      },
    })
    .catch((error) => {
      console.warn('[operationLog] 写入失败：', error instanceof Error ? error.message : error);
    });
}

function safeStringify(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}

function parseDetail(value: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export async function listLogs(query: {
  page: number;
  pageSize: number;
  action?: string;
  userId?: number;
  targetType?: string;
  startAt?: Date;
  endAt?: Date;
}) {
  const createdAt: Prisma.DateTimeFilter | undefined =
    query.startAt || query.endAt
      ? { gte: query.startAt, lte: query.endAt }
      : undefined;

  const where: Prisma.OperationLogWhereInput = {
    action: query.action ? { contains: query.action } : undefined,
    userId: query.userId,
    targetType: query.targetType,
    createdAt,
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

  return {
    list: list.map((item) => ({ ...item, detail: parseDetail(item.detail) })),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}
