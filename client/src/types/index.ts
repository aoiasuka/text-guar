import type { ContentStatus, DetectionResult, RiskLevel, Role } from '@text-guard/shared';

export type SensitiveMatchType = 'literal' | 'regex' | 'credential';

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
  createdAt: string;
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
