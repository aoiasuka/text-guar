import type { Role } from '@text-guard/shared';

export type DataScopeLevel = 'any' | 'own';

declare global {
  namespace Express {
    interface User {
      id: number;
      username: string;
      role: Role;
    }

    interface Request {
      user?: User;
      requestId?: string;
      dataScope?: {
        scope: DataScopeLevel;
        ownerId: number;
      };
    }
  }
}

export {};
