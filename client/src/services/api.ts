import type { DetectionResult, RiskLevel } from '@text-guard/shared';
import request from './request.js';
import type {
  Content,
  OperationLog,
  PageResult,
  SensitiveWord,
  SubmitContentResult,
  User,
} from '@/types/index.js';

export const authApi = {
  login: (data: { username: string; password: string }) =>
    request.post<{ token: string; user: User }>('/auth/login', data),
  profile: () => request.get<User>('/auth/profile'),
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

export const sensitiveApi = {
  list: (params?: Record<string, unknown>) =>
    request.get<PageResult<SensitiveWord>>('/sensitive-words', { params }),
  create: (data: Omit<SensitiveWord, 'id' | 'enabled' | 'createdAt'>) =>
    request.post<SensitiveWord>('/sensitive-words', data),
  update: (id: number, data: Omit<SensitiveWord, 'id' | 'enabled' | 'createdAt'>) =>
    request.put<SensitiveWord>(`/sensitive-words/${id}`, data),
  toggle: (id: number, enabled: boolean) =>
    request.patch<SensitiveWord>(`/sensitive-words/${id}/toggle`, { enabled }),
  remove: (id: number) => request.delete<boolean>(`/sensitive-words/${id}`),
};

export const reviewApi = {
  pending: (params?: Record<string, unknown>) =>
    request.get<PageResult<Content>>('/reviews/pending', { params }),
  history: (params?: Record<string, unknown>) => request.get('/reviews/history', { params }),
  approve: (id: number, comment?: string) =>
    request.post<Content>(`/reviews/${id}/approve`, { comment }),
  reject: (id: number, comment?: string) => request.post<Content>(`/reviews/${id}/reject`, { comment }),
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
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = type === 'word' ? 'content-security-report.docx' : 'content-security-report.xlsx';
    link.click();
    URL.revokeObjectURL(url);
  },
};

export const logApi = {
  list: (params?: Record<string, unknown>) => request.get<PageResult<OperationLog>>('/logs', { params }),
};
