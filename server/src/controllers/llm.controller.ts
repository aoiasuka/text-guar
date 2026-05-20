import type { Request, Response } from 'express';
import { z } from 'zod';
import { detector, detectWithLLM } from '../engine/detector.js';
import { checkHealth, isLLMEnabled, withTraceCollection } from '../engine/llm-judge.js';
import { ok } from '../utils/response.js';

export const testSchema = z.object({
  text: z.string().min(1).max(4000),
});

/**
 * GET /api/llm/status
 * 返回当前 LLM 复核配置（静态，不探活）
 */
export function statusController(_req: Request, res: Response) {
  return ok(res, {
    enabled: isLLMEnabled(),
    model: process.env.LLM_JUDGE_MODEL || 'gemma4:e2b',
    host: process.env.OLLAMA_HOST || 'http://localhost:11434',
    timeoutMs: Number(process.env.LLM_JUDGE_TIMEOUT_MS || 5000),
    maxPerDetection: Number(process.env.LLM_JUDGE_MAX_PER_DETECTION || 3),
  });
}

/**
 * GET /api/llm/health
 * 实际探活 Ollama 与模型可用性
 */
export async function healthController(_req: Request, res: Response) {
  return ok(res, await checkHealth());
}

/**
 * POST /api/llm/test
 * 给定一段文本，跑完整检测流水线（规则 + 变体 + 上下文 + LLM 复核）
 * 返回 baseline / enhanced 两份结果、各自耗时、LLM 调用 traces；不写 detection_events
 */
export async function testController(req: Request, res: Response) {
  const text: string = req.body.text;

  const t0 = Date.now();
  const baseline = detector.detect(text);
  const baselineMs = Date.now() - t0;

  const t1 = Date.now();
  const { value: enhanced, traces } = await withTraceCollection(() => detectWithLLM(text));
  const enhancedMs = Date.now() - t1;

  const judgedCount = enhanced.matches.filter((m) => m.judgeVerdict).length;

  return ok(res, {
    llm: {
      enabled: isLLMEnabled(),
      model: process.env.LLM_JUDGE_MODEL || 'gemma4:e2b',
      host: process.env.OLLAMA_HOST || 'http://localhost:11434',
      judgedCount,
      tracesCount: traces.length,
    },
    timing: {
      baselineMs,
      enhancedMs,
      llmOverheadMs: Math.max(0, enhancedMs - baselineMs),
    },
    baseline,
    enhanced,
    traces,
  });
}
