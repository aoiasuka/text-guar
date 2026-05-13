import { prisma } from '../utils/prisma.js';

async function assertPendingContent(contentId: number) {
  const content = await prisma.content.findUniqueOrThrow({
    where: { id: contentId },
    select: { status: true },
  });

  if (content.status !== 'pending') {
    throw new Error('只有待审核内容可以执行审核操作');
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
  return content;
}
