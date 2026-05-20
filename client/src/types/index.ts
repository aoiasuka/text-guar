import type { ContentStatus, DetectionResult, RiskLevel, Role } from '@text-guard/shared';

export type SensitiveMatchType = 'literal' | 'regex' | 'credential';
export type SensitiveContextScope = 'strict' | 'lenient' | 'global';

export interface User {
  id: number;
  username: string;
  role: Role;
  createdAt: string;
}

export interface MenuNode {
  id: number;
  name: string;
  path: string;
  icon: string | null;
  sort: number;
  permissionCode: string | null;
  children: MenuNode[];
}

export interface Content {
  id: number;
  title: string;
  body: string;
  filteredBody: string;
  category: string;
  status: ContentStatus;
  riskLevel?: RiskLevel;
  riskScore: number;
  detectionResult?: DetectionResult;
  isPinned: boolean;
  author: User;
  createdAt: string;
  updatedAt: string;
}

export interface SubmitContentResult {
  rejected: boolean;
  content?: Content;
  detection: DetectionResult;
}

export interface SensitiveWord {
  id: number;
  word: string;
  matchType: SensitiveMatchType;
  pattern?: string | null;
  riskLevel: RiskLevel;
  replacement: string;
  category: string;
  enabled: boolean;
  version: number;
  baseConfidence: number;
  variantMatch: boolean;
  contextScope: SensitiveContextScope;
  positiveSamples?: string | null;
  negativeSamples?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DetectionEvent {
  id: number;
  contentId: number | null;
  wordId: number | null;
  wordVersion: number | null;
  ruleSource: string;
  hitText: string;
  start: number;
  end: number;
  riskLevel: RiskLevel;
  confidence: number;
  judgeVerdict: string | null;
  reason: string | null;
  createdAt: string;
}

export interface RuleTestResult {
  passed: Array<{ sample: string; matched: boolean }>;
  failed: Array<{ sample: string; matched: boolean; expected: boolean }>;
}

export interface OperationLog {
  id: number;
  action: string;
  targetType: string;
  targetId?: number;
  detail?: unknown;
  ip?: string;
  createdAt: string;
  user: Pick<User, 'id' | 'username' | 'role'>;
}

export interface PageResult<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AuthSession {
  token: string;
  user: User;
  permissions: string[];
  menus: MenuNode[];
}

export interface LLMStatus {
  enabled: boolean;
  model: string;
  host: string;
  timeoutMs: number;
  maxPerDetection: number;
}

export interface LLMHealth {
  enabled: boolean;
  host: string;
  model: string;
  reachable: boolean;
  modelInstalled: boolean;
  availableModels: string[];
  latencyMs: number;
  error?: string;
}

export interface LLMJudgeTrace {
  word: string;
  category: string;
  durationMs: number;
  fromCache: boolean;
  ok: boolean;
  verdict?: 'sensitive' | 'neutral' | 'quote' | 'reverse';
  reason?: string;
  errorMessage?: string;
  httpStatus?: number;
  promptPreview: string;
  rawResponse?: string;
}

export interface LLMTestResult {
  llm: {
    enabled: boolean;
    model: string;
    host: string;
    judgedCount: number;
    tracesCount: number;
  };
  timing: {
    baselineMs: number;
    enhancedMs: number;
    llmOverheadMs: number;
  };
  baseline: import('@text-guard/shared').DetectionResult;
  enhanced: import('@text-guard/shared').DetectionResult;
  traces: LLMJudgeTrace[];
}
