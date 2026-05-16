import { prisma } from '../utils/prisma.js';
import { HttpError } from '../utils/errors.js';
import { invalidateStatsCache } from './report.service.js';

async function assertPendingContent(contentId: number) {
  const content = await prisma.content.findUniqueOrThrow({
    where: { id: contentId },
    select: { status: true },
  });

  if (content.status !== 'pending') {
    throw new HttpError(409, '只有待审核内容可以执行审核操作');
  }
}

export async function listPendingReviews(page: number, pageSize: number) {
  const where = { status: 'pending' as const };
  const [list, total] = await Promise.all([
    prisma.content.findMany({
      where,
      include: { author: { select: { id: true, username: true, role: true } } },
      orderBy: [{ riskLevel: 'desc' }, { createdAt: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.content.count({ where }),
  ]);
  return { list, total, page, pageSize };
}

export async function listReviewHistory(page: number, pageSize: number) {
  const [list, total] = await Promise.all([
    prisma.review.findMany({
      include: {
        reviewer: { select: { id: true, username: true, role: true } },
        content: { select: { id: true, title: true, riskLevel: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.review.count(),
  ]);
  return { list, total, page, pageSize };
}

export async function approveContent(contentId: number, reviewerId: number, comment?: string) {
  await assertPendingContent(contentId);

  const [, content] = await prisma.$transaction([
    prisma.review.create({
      data: { contentId, reviewerId, action: 'approve', comment },
    }),
    prisma.content.update({ where: { id: contentId }, data: { status: 'published' } }),
  ]);
  invalidateStatsCache();
  return content;
}

export async function rejectContent(contentId: number, reviewerId: number, comment?: string) {
  await assertPendingContent(contentId);

  const [, content] = await prisma.$transaction([
    prisma.review.create({
      data: { contentId, reviewerId, action: 'reject', comment },
    }),
    prisma.content.update({ where: { id: contentId }, data: { status: 'rejected' } }),
  ]);
  invalidateStatsCache();
  return content;
}

export async function batchReview(
  contentIds: number[],
  reviewerId: number,
  action: 'approve' | 'reject',
  comment?: string,
) {
  if (contentIds.length === 0) return { count: 0, skipped: [] as number[] };

  const pendingContents = await prisma.content.findMany({
    where: { id: { in: contentIds }, status: 'pending' },
    select: { id: true },
  });
  const pendingIds = pendingContents.map((c) => c.id);
  const skipped = contentIds.filter((id) => !pendingIds.includes(id));

  if (pendingIds.length > 0) {
    const nextStatus = action === 'approve' ? 'published' : 'rejected';
    await prisma.$transaction([
      prisma.review.createMany({
        data: pendingIds.map((contentId) => ({ contentId, reviewerId, action, comment })),
      }),
      prisma.content.updateMany({
        where: { id: { in: pendingIds } },
        data: { status: nextStatus },
      }),
    ]);
    invalidateStatsCache();
  }

  return { count: pendingIds.length, skipped };
}
