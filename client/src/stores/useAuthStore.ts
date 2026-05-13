import { create } from 'zustand';
import type { User } from '@/types/index.js';

interface AuthState {
  token: string;
  user?: User;
  setSession: (token: string, user: User) => void;
  logout: () => void;
}

const saved = localStorage.getItem('text_guard_session');
const initial = saved ? (JSON.parse(saved) as { token: string; user: User }) : undefined;

export const useAuthStore = create<AuthState>((set) => ({
  token: initial?.token || '',
  user: initial?.user,
  setSession: (token, user) => {
    localStorage.setItem('text_guard_session', JSON.stringify({ token, user }));
    set({ token, user });
  },
  logout: () => {
    localStorage.removeItem('text_guard_session');
    set({ token: '', user: undefined });
  },
}));
