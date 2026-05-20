export type Role = 'admin' | 'editor';
export type ContentStatus = 'draft' | 'pending' | 'published' | 'rejected';
export type RiskLevel = 'low' | 'medium' | 'high';
export type ReviewAction = 'approve' | 'reject';
export type FilterStrategy = 'replace' | 'mask' | 'warn' | 'reject';

export interface UserProfile {
  id: number;
  username: string;
  role: Role;
  createdAt: string;
}

export interface DetectionMatch {
  type: 'word' | 'regex';
  word: string;
  riskLevel: RiskLevel;
  category: string;
  replacement: string;
  start: number;
  end: number;
  source?: 'literal' | 'literal_variant' | 'regex' | 'credential' | 'llm';
  confidence?: number;
  /**
   * 经 AI 复核改写前的置信度。仅当 judgeVerdict 存在时填充。
   * 前端用于展示「规则 X% → AI:verdict → 最终 Y%」全链路。
   */
  originalConfidence?: number;
  reason?: string;
  judgeVerdict?: 'sensitive' | 'neutral' | 'quote' | 'reverse';
}

export interface DetectionResult {
  matches: DetectionMatch[];
  score: number;
  level: RiskLevel;
  strategy: FilterStrategy;
  filteredText: string;
  summary: string;
}

export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

export interface PageResult<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}
