import type { Role } from '@text-guard/shared';

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
    }
  }
}

export {};
