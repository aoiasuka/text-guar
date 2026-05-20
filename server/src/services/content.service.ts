import { Prisma } from '@prisma/client';
import type { ContentStatus, RiskLevel } from '@text-guard/shared';
import { detector } from '../engine/detector.js';
import { prisma } from '../utils/prisma.js';
import { HttpError } from '../utils/errors.js';
import { invalidateStatsCache } from './report.service.js';
import type { DataScopeLevel } from './permission.service.js';

const includeAuthor = { author: { select: { id: true, username: true, role: true } } };

const listSelect = {
  id: true,
  title: true,
  category: true,
  status: true,
  riskLevel: true,
  riskScore: true,
  isPinned: true,
  authorId: true,
  createdAt: true,
  updatedAt: true,
  author: { select: { id: true, username: true, role: true } },
} satisfies Prisma.ContentSelect;

export interface ContentScope {
  scope: DataScopeLevel;
  ownerId: number;
}

function applyScope(
  where: Prisma.ContentWhereInput,
  scope?: ContentScope,
): Prisma.ContentWhereInput {
  if (!scope || scope.scope === 'any') return where;
  return { ...where, authorId: scope.ownerId };
}

async function assertCanAccessContent(id: number, scope?: ContentScope): Promise<void> {
  if (!scope || scope.scope === 'any') return;
  const owned = await prisma.content.findFirst({
    where: { id, authorId: scope.ownerId },
    select: { id: true },
  });
  if (!owned) throw new HttpError(403, '无权访问该内容');
}

export async function listContents(
  query: {
    page: number;
    pageSize: number;
    status?: ContentStatus;
    riskLevel?: RiskLevel;
    category?: string;
    keyword?: string;
  },
  scope?: ContentScope,
) {
  const where = applyScope(
    {
      status: query.status,
      riskLevel: query.riskLevel,
      category: query.category ? { contains: query.category } : undefined,
      OR: query.keyword
        ? [{ title: { contains: query.keyword } }, { body: { contains: query.keyword } }]
        : undefined,
    },
    scope,
  );

  const [list, total] = await Promise.all([
    prisma.content.findMany({
      where,
      select: listSelect,
      orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.content.count({ where }),
  ]);
  return { list, total, page: query.page, pageSize: query.pageSize };
}

export async function getContent(id: number, scope?: ContentScope) {
  await assertCanAccessContent(id, scope);
  return prisma.content.findUniqueOrThrow({
    where: { id },
    include: {
      ...includeAuthor,
      reviews: {
        include: { reviewer: { select: { id: true, username: true, role: true } } },
        orderBy: { createdAt: 'desc' },
      },
    },
  });
}

export async function detectText(text: string) {
  return detector.detect(text);
}

export async function createContent(input: {
  title: string;
  body: string;
  category: string;
  authorId: number;
}) {
  const detection = detector.detect(input.body);
  const content = await prisma.content.create({
    data: {
      title: input.title,
      body: input.body,
      filteredBody: detection.filteredText,
      category: input.category,
      authorId: input.authorId,
      riskLevel: detection.level,
      riskScore: detection.score,
      detectionResult: detection as unknown as Prisma.InputJsonValue,
      status: 'draft',
    },
    include: includeAuthor,
  });
  invalidateStatsCache();
  return content;
}

export async function updateContent(
  id: number,
  input: Partial<{ title: string; body: string; category: string }>,
  scope?: ContentScope,
) {
  await assertCanAccessContent(id, scope);
  const body = input.body;
  const detection = body ? detector.detect(body) : undefined;
  const content = await prisma.content.update({
    where: { id },
    data: {
      title: input.title,
      body,
      category: input.category,
      filteredBody: detection?.filteredText,
      riskLevel: detection?.level,
      riskScore: detection?.score,
      detectionResult: detection as unknown as Prisma.InputJsonValue,
      status: 'draft',
    },
    include: includeAuthor,
  });
  invalidateStatsCache();
  return content;
}

export async function deleteContent(id: number, scope?: ContentScope) {
  await assertCanAccessContent(id, scope);
  await prisma.content.delete({ where: { id } });
  invalidateStatsCache();
}

export async function submitContent(id: number, scope?: ContentScope) {
  await assertCanAccessContent(id, scope);
  const content = await prisma.content.findUniqueOrThrow({ where: { id } });
  const detection = detector.detect(content.body);

  if (detection.strategy === 'reject') {
    const updated = await prisma.content.update({
      where: { id },
      data: {
        status: 'rejected',
        filteredBody: detection.filteredText,
        riskLevel: detection.level,
        riskScore: detection.score,
        detectionResult: detection as unknown as Prisma.InputJsonValue,
      },
    });
    invalidateStatsCache();
    return { rejected: true, content: updated, detection };
  }

  const updated = await prisma.content.update({
    where: { id },
    data: {
      status: 'pending',
      filteredBody: detection.filteredText,
      riskLevel: detection.level,
      riskScore: detection.score,
      detectionResult: detection as unknown as Prisma.InputJsonValue,
    },
  });
  invalidateStatsCache();
  return { rejected: false, content: updated, detection };
}

export async function pinContent(id: number, isPinned: boolean) {
  return prisma.content.update({ where: { id }, data: { isPinned } });
}
