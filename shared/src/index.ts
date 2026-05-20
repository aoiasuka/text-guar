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
