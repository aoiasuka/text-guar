import { Prisma, SensitiveContextScope, SensitiveMatchType } from '@prisma/client';
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
      baseConfidence: item.baseConfidence,
      variantMatch: item.variantMatch,
      contextScope: item.contextScope,
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
  baseConfidence?: number;
  variantMatch?: boolean;
  contextScope?: SensitiveContextScope;
  positiveSamples?: string[] | null;
  negativeSamples?: string[] | null;
}

function serializeSamples(samples: string[] | null | undefined): string | null | undefined {
  if (samples === undefined) return undefined;
  if (samples === null) return null;
  return JSON.stringify(samples);
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

export async function getSensitiveWord(id: number) {
  return prisma.sensitiveWord.findUniqueOrThrow({ where: { id } });
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
      baseConfidence: input.baseConfidence ?? 1.0,
      variantMatch: input.variantMatch ?? true,
      contextScope: input.contextScope ?? SensitiveContextScope.strict,
      positiveSamples: serializeSamples(input.positiveSamples),
      negativeSamples: serializeSamples(input.negativeSamples),
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
    baseConfidence: item.baseConfidence ?? 1.0,
    variantMatch: item.variantMatch ?? true,
    contextScope: item.contextScope ?? SensitiveContextScope.strict,
    positiveSamples: serializeSamples(item.positiveSamples) ?? null,
    negativeSamples: serializeSamples(item.negativeSamples) ?? null,
  }));
  const result = await prisma.sensitiveWord.createMany({ data, skipDuplicates: true });
  await rebuildDetector();
  return { count: result.count };
}

export async function updateSensitiveWord(
  id: number,
  input: Partial<SensitiveWordInput & { enabled: boolean }>,
) {
  // 任何更新都让 version 自增，便于审计回溯命中事件对应的规则版本
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
      baseConfidence: input.baseConfidence,
      variantMatch: input.variantMatch,
      contextScope: input.contextScope,
      positiveSamples: serializeSamples(input.positiveSamples),
      negativeSamples: serializeSamples(input.negativeSamples),
      version: { increment: 1 },
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
    data: { enabled, version: { increment: 1 } },
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

/**
 * 拉取所有启用词条 + version，用于事件写入时把命中锚定到规则
 */
export async function loadWordIndex() {
  const rows = await prisma.sensitiveWord.findMany({
    where: { enabled: true },
    select: { id: true, word: true, version: true },
  });
  const map = new Map<string, { id: number; version: number }>();
  for (const r of rows) {
    map.set(r.word, { id: r.id, version: r.version });
    map.set(r.word.toLowerCase(), { id: r.id, version: r.version });
  }
  return map;
}

export interface RuleTestResult {
  passed: Array<{ sample: string; matched: boolean }>;
  failed: Array<{ sample: string; matched: boolean; expected: boolean }>;
}

/**
 * 跑某条规则的 positive/negative 样本回归
 * - positive 应命中（matched=true）
 * - negative 不应命中（matched=false）
 */
export async function testSensitiveWord(id: number): Promise<RuleTestResult> {
  const rule = await prisma.sensitiveWord.findUniqueOrThrow({ where: { id } });
  const positive: string[] = rule.positiveSamples ? safeParseArray(rule.positiveSamples) : [];
  const negative: string[] = rule.negativeSamples ? safeParseArray(rule.negativeSamples) : [];
  const passed: RuleTestResult['passed'] = [];
  const failed: RuleTestResult['failed'] = [];

  for (const sample of positive) {
    const r = detector.detect(sample);
    const matched = r.matches.some(
      (m) =>
        m.category === rule.category ||
        m.word === rule.word ||
        m.replacement === rule.replacement,
    );
    if (matched) passed.push({ sample, matched });
    else failed.push({ sample, matched, expected: true });
  }
  for (const sample of negative) {
    const r = detector.detect(sample);
    const matched = r.matches.some(
      (m) =>
        m.category === rule.category ||
        m.word === rule.word ||
        m.replacement === rule.replacement,
    );
    if (!matched) passed.push({ sample, matched });
    else failed.push({ sample, matched, expected: false });
  }
  return { passed, failed };
}

function safeParseArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}
