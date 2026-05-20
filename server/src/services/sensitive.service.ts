import { Prisma, SensitiveMatchType } from '@prisma/client';
import type { RiskLevel } from '@text-guard/shared';
import { detector } from '../engine/detector.js';
import { prisma } from '../utils/prisma.js';

async function loadAndRebuild() {
  const words = await prisma.sensitiveWord.findMany({ where: { enabled: true } });
  detector.rebuild(
    words.map((item) => ({
      word: item.word,
      matchType: item.matchType,
      pattern: item.pattern,
      riskLevel: item.riskLevel,
      replacement: item.replacement,
      category: item.category,
    })),
  );
}

let runningRebuild: Promise<void> | null = null;
let queuedRebuild: Promise<void> | null = null;

export function rebuildDetector(): Promise<void> {
  if (runningRebuild) {
    if (!queuedRebuild) {
      queuedRebuild = runningRebuild
        .catch(() => undefined)
        .then(() => {
          const next = loadAndRebuild();
          runningRebuild = next;
          queuedRebuild = null;
          return next.finally(() => {
            if (runningRebuild === next) runningRebuild = null;
          });
        });
    }
    return queuedRebuild;
  }
  const initial = loadAndRebuild();
  runningRebuild = initial;
  return initial.finally(() => {
    if (runningRebuild === initial) runningRebuild = null;
  });
}

export interface SensitiveWordInput {
  word: string;
  matchType?: SensitiveMatchType;
  pattern?: string | null;
  riskLevel: RiskLevel;
  replacement: string;
  category: string;
}

export async function listSensitiveWords(query: {
  page: number;
  pageSize: number;
  keyword?: string;
  riskLevel?: RiskLevel;
  enabled?: boolean;
  matchType?: SensitiveMatchType;
}) {
  const where: Prisma.SensitiveWordWhereInput = {
    word: query.keyword ? { contains: query.keyword } : undefined,
    riskLevel: query.riskLevel,
    enabled: query.enabled,
    matchType: query.matchType,
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

export async function createSensitiveWord(input: SensitiveWordInput) {
  const item = await prisma.sensitiveWord.create({
    data: {
      word: input.word,
      matchType: input.matchType ?? SensitiveMatchType.literal,
      pattern: input.pattern ?? null,
      riskLevel: input.riskLevel,
      replacement: input.replacement,
      category: input.category,
    },
  });
  await rebuildDetector();
  return item;
}

export async function batchCreateSensitiveWords(items: SensitiveWordInput[]) {
  const data = items.map((item) => ({
    word: item.word,
    matchType: item.matchType ?? SensitiveMatchType.literal,
    pattern: item.pattern ?? null,
    riskLevel: item.riskLevel,
    replacement: item.replacement,
    category: item.category,
  }));
  const result = await prisma.sensitiveWord.createMany({ data, skipDuplicates: true });
  await rebuildDetector();
  return { count: result.count };
}

export async function updateSensitiveWord(
  id: number,
  input: Partial<SensitiveWordInput & { enabled: boolean }>,
) {
  const item = await prisma.sensitiveWord.update({
    where: { id },
    data: {
      word: input.word,
      matchType: input.matchType,
      pattern: input.pattern,
      riskLevel: input.riskLevel,
      replacement: input.replacement,
      category: input.category,
      enabled: input.enabled,
    },
  });
  await rebuildDetector();
  return item;
}

export async function deleteSensitiveWord(id: number) {
  await prisma.sensitiveWord.delete({ where: { id } });
  await rebuildDetector();
}

export async function batchUpdateEnabled(ids: number[], enabled: boolean) {
  if (ids.length === 0) return { count: 0 };
  const result = await prisma.sensitiveWord.updateMany({
    where: { id: { in: ids } },
    data: { enabled },
  });
  await rebuildDetector();
  return { count: result.count };
}

export async function batchDeleteSensitiveWords(ids: number[]) {
  if (ids.length === 0) return { count: 0 };
  const result = await prisma.sensitiveWord.deleteMany({ where: { id: { in: ids } } });
  await rebuildDetector();
  return { count: result.count };
}
