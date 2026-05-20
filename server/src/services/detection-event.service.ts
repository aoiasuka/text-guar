import { Prisma } from '@prisma/client';
import type { DetectionMatch } from '@text-guard/shared';
import { prisma } from '../utils/prisma.js';

interface WriteEventsArgs {
  matches: DetectionMatch[];
  contentId?: number | null;
  // 词典命中时，提供 word→{id, version} 的映射，便于把事件锚定到具体规则版本
  wordIndex?: Map<string, { id: number; version: number }>;
}

/**
 * 把命中数组异步写入 detection_events（fire-and-forget，写库失败仅 warn）
 */
export function writeEvents(args: WriteEventsArgs): void {
  if (!args.matches.length) return;
  const rows: Prisma.DetectionEventCreateManyInput[] = args.matches.map((m) => {
    const meta = m.source === 'literal' || m.source === 'literal_variant'
      ? args.wordIndex?.get(m.word) ?? args.wordIndex?.get(normalizeWord(m.word))
      : undefined;
    return {
      contentId: args.contentId ?? null,
      wordId: meta?.id ?? null,
      wordVersion: meta?.version ?? null,
      ruleSource: m.source ?? 'literal',
      hitText: m.word.slice(0, 500),
      start: m.start,
      end: m.end,
      riskLevel: m.riskLevel,
      confidence: m.confidence ?? 1,
      judgeVerdict: m.judgeVerdict ?? null,
      reason: m.reason?.slice(0, 200) ?? null,
    };
  });
  prisma.detectionEvent
    .createMany({ data: rows })
    .catch((error) => {
      console.warn('[detectionEvent] 写入失败：', error instanceof Error ? error.message : error);
    });
}

function normalizeWord(s: string): string {
  return s.toLowerCase().trim();
}

export async function listEventsByWord(wordId: number, page = 1, pageSize = 20) {
  const where: Prisma.DetectionEventWhereInput = { wordId };
  const [list, total] = await Promise.all([
    prisma.detectionEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.detectionEvent.count({ where }),
  ]);
  return { list, total, page, pageSize };
}

export async function listEventsByContent(contentId: number) {
  return prisma.detectionEvent.findMany({
    where: { contentId },
    orderBy: { createdAt: 'desc' },
    include: { word: { select: { id: true, word: true, category: true } } },
  });
}
