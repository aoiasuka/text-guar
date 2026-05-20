import { create } from 'zustand';
import type { MenuNode, User } from '@/types/index.js';

interface AuthState {
  token: string;
  user?: User;
  permissions: string[];
  menus: MenuNode[];
  setSession: (input: { token: string; user: User; permissions: string[]; menus: MenuNode[] }) => void;
  updateAccess: (permissions: string[], menus: MenuNode[]) => void;
  logout: () => void;
}

const STORAGE_KEY = 'text_guard_session';

interface PersistedSession {
  token: string;
  user: User;
  permissions?: string[];
  menus?: MenuNode[];
}

function readSaved(): PersistedSession | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return undefined;
    return JSON.parse(raw) as PersistedSession;
  } catch {
    return undefined;
  }
}

const saved = readSaved();

export const useAuthStore = create<AuthState>((set, get) => ({
  token: saved?.token || '',
  user: saved?.user,
  permissions: saved?.permissions ?? [],
  menus: saved?.menus ?? [],
  setSession: ({ token, user, permissions, menus }) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, user, permissions, menus }));
    set({ token, user, permissions, menus });
  },
  updateAccess: (permissions, menus) => {
    const { token, user } = get();
    if (token && user) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, user, permissions, menus }));
    }
    set({ permissions, menus });
  },
  logout: () => {
    localStorage.removeItem(STORAGE_KEY);
    set({ token: '', user: undefined, permissions: [], menus: [] });
  },
}));
