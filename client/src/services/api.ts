import type { DetectionResult, RiskLevel } from '@text-guard/shared';
import request from './request.js';
import type {
  AuthSession,
  Content,
  DetectionEvent,
  LLMHealth,
  LLMStatus,
  LLMTestResult,
  MenuNode,
  OperationLog,
  PageResult,
  RuleTestResult,
  SensitiveWord,
  SubmitContentResult,
  User,
} from '@/types/index.js';

export const authApi = {
  login: (data: { username: string; password: string }) =>
    request.post<AuthSession>('/auth/login', data),
  profile: () =>
    request.get<{ user: User; permissions: string[]; menus: MenuNode[] }>('/auth/profile'),
  menu: () => request.get<MenuNode[]>('/auth/menu'),
  permissions: () => request.get<string[]>('/auth/permissions'),
};

export const contentApi = {
  list: (params?: Record<string, unknown>) => request.get<PageResult<Content>>('/contents', { params }),
  detail: (id: number) => request.get<Content>(`/contents/${id}`),
  create: (data: { title: string; body: string; category: string }) =>
    request.post<Content>('/contents', data),
  update: (id: number, data: { title: string; body: string; category: string }) =>
    request.put<Content>(`/contents/${id}`, data),
  remove: (id: number) => request.delete<boolean>(`/contents/${id}`),
  submit: (id: number) => request.patch<SubmitContentResult>(`/contents/${id}/submit`),
  pin: (id: number, isPinned: boolean) => request.patch<Content>(`/contents/${id}/pin`, { isPinned }),
  detect: (text: string) => request.post<DetectionResult>('/contents/detect', { text }),
};

export type SensitiveWordPayload = Omit<
  SensitiveWord,
  'id' | 'enabled' | 'createdAt' | 'updatedAt' | 'version' | 'positiveSamples' | 'negativeSamples'
> & {
  positiveSamples?: string[];
  negativeSamples?: string[];
};

export const sensitiveApi = {
  list: (params?: Record<string, unknown>) =>
    request.get<PageResult<SensitiveWord>>('/sensitive-words', { params }),
  detail: (id: number) => request.get<SensitiveWord>(`/sensitive-words/${id}`),
  create: (data: SensitiveWordPayload) => request.post<SensitiveWord>('/sensitive-words', data),
  update: (id: number, data: SensitiveWordPayload) =>
    request.put<SensitiveWord>(`/sensitive-words/${id}`, data),
  toggle: (id: number, enabled: boolean) =>
    request.patch<SensitiveWord>(`/sensitive-words/${id}/toggle`, { enabled }),
  remove: (id: number) => request.delete<boolean>(`/sensitive-words/${id}`),
  batchToggle: (ids: number[], enabled: boolean) =>
    request.post<{ count: number }>('/sensitive-words/batch/toggle', { ids, enabled }),
  batchRemove: (ids: number[]) =>
    request.post<{ count: number }>('/sensitive-words/batch/delete', { ids }),
  events: (id: number, params?: Record<string, unknown>) =>
    request.get<PageResult<DetectionEvent>>(`/sensitive-words/${id}/events`, { params }),
  test: (id: number) => request.post<RuleTestResult>(`/sensitive-words/${id}/test`),
};

export const reviewApi = {
  pending: (params?: Record<string, unknown>) =>
    request.get<PageResult<Content>>('/reviews/pending', { params }),
  history: (params?: Record<string, unknown>) => request.get('/reviews/history', { params }),
  approve: (id: number, comment?: string) =>
    request.post<Content>(`/reviews/${id}/approve`, { comment }),
  reject: (id: number, comment?: string) => request.post<Content>(`/reviews/${id}/reject`, { comment }),
  batch: (contentIds: number[], action: 'approve' | 'reject', comment?: string) =>
    request.post<{ count: number; skipped: number[] }>('/reviews/batch', {
      contentIds,
      action,
      comment,
    }),
};

export const reportApi = {
  stats: () =>
    request.get<{
      totalContents: number;
      pending: number;
      published: number;
      rejected: number;
      highRisk: number;
      reviews: number;
      passRate: number;
      riskDistribution: Array<{ riskLevel: RiskLevel; _count: number }>;
      recentLogs: OperationLog[];
    }>('/reports/stats'),
  download: async (type: 'word' | 'excel', token: string) => {
    const response = await fetch(`/api/reports/export/${type}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error('导出失败');
    const blob = await response.blob();
    const disposition = response.headers.get('content-disposition') || '';
    const match = /filename\*?=(?:UTF-8'')?["']?([^;"']+)["']?/i.exec(disposition);
    const fallback = type === 'word' ? 'content-security-report.docx' : 'content-security-report.xlsx';
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = match ? decodeURIComponent(match[1]) : fallback;
    link.click();
    URL.revokeObjectURL(url);
  },
};

export const logApi = {
  list: (params?: Record<string, unknown> | object) =>
    request.get<PageResult<OperationLog>>('/logs', { params }),
};

export const llmApi = {
  status: () => request.get<LLMStatus>('/llm/status'),
  health: () => request.get<LLMHealth>('/llm/health'),
  test: (text: string) => request.post<LLMTestResult>('/llm/test', { text }),
};
