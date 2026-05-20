import type { Request, Response } from 'express';
import { z } from 'zod';
import { detector, detectWithLLM } from '../engine/detector.js';
import { isLLMEnabled } from '../engine/llm-judge.js';
import { ok } from '../utils/response.js';

export const testSchema = z.object({
  text: z.string().min(1).max(4000),
});

/**
 * GET /api/llm/status
 * 返回当前 LLM 复核配置：是否启用、使用模型、Ollama 主机
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
 * POST /api/llm/test
 * 给定一段文本，跑完整检测流水线（规则 + 变体 + 上下文 + LLM 复核），返回详细结果与耗时
 * 不写 detection_events（专门测试用途）
 */
export async function testController(req: Request, res: Response) {
  const text: string = req.body.text;

  const t0 = Date.now();
  const baseline = detector.detect(text);
  const baselineMs = Date.now() - t0;

  const t1 = Date.now();
  const enhanced = await detectWithLLM(text);
  const enhancedMs = Date.now() - t1;

  // 统计 LLM 实际改动了多少条命中
  const judgedCount = enhanced.matches.filter((m) => m.judgeVerdict).length;

  return ok(res, {
    llm: {
      enabled: isLLMEnabled(),
      model: process.env.LLM_JUDGE_MODEL || 'gemma4:e2b',
      judgedCount,
    },
    timing: {
      baselineMs,
      enhancedMs,
      llmOverheadMs: Math.max(0, enhancedMs - baselineMs),
    },
    baseline,
    enhanced,
  });
}
