import { Prisma } from '@prisma/client';
import type { RiskLevel } from '@text-guard/shared';
import { detector } from '../engine/detector.js';
import { prisma } from '../utils/prisma.js';

export async function rebuildDetector() {
  const words = await prisma.sensitiveWord.findMany({ where: { enabled: true } });
  detector.rebuild(
    words.map((item) => ({
      word: item.word,
      riskLevel: item.riskLevel,
      replacement: item.replacement,
      category: item.category,
    })),
  );
}

export async function listSensitiveWords(query: {
  page: number;
  pageSize: number;
  keyword?: string;
  riskLevel?: RiskLevel;
  enabled?: boolean;
}) {
  const where: Prisma.SensitiveWordWhereInput = {
    word: query.keyword ? { contains: query.keyword } : undefined,
    riskLevel: query.riskLevel,
    enabled: query.enabled,
  };
  const [list, total] = await Promise.all([
    prisma.sensitiveWord.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.sensitiveWord.count({ where }),
  ]);

  return { list, total, page: query.page, pageSize: query.pageSize };
}

export async function createSensitiveWord(input: {
  word: string;
  riskLevel: RiskLevel;
  replacement: string;
  category: string;
}) {
  const item = await prisma.sensitiveWord.create({ data: input });
  await rebuildDetector();
  return item;
}

export async function batchCreateSensitiveWords(
  items: Array<{ word: string; riskLevel: RiskLevel; replacement: string; category: string }>,
) {
  await prisma.sensitiveWord.createMany({ data: items, skipDuplicates: true });
  await rebuildDetector();
  return { count: items.length };
}

export async function updateSensitiveWord(
  id: number,
  input: Partial<{ word: string; riskLevel: RiskLevel; replacement: string; category: string; enabled: boolean }>,
) {
  const item = await prisma.sensitiveWord.update({ where: { id }, data: input });
  await rebuildDetector();
  return item;
}

export async function deleteSensitiveWord(id: number) {
  await prisma.sensitiveWord.delete({ where: { id } });
  await rebuildDetector();
}
