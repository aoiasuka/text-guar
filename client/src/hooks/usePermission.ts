import { useMemo } from 'react';
import { useAuthStore } from '@/stores/useAuthStore.js';

export function usePermission() {
  const permissions = useAuthStore((s) => s.permissions);
  return useMemo(() => {
    const set = new Set(permissions);
    const has = (code?: string | null) => (code ? set.has(code) : true);
    const hasAny = (...codes: string[]) => codes.some((c) => set.has(c));
    const hasAll = (...codes: string[]) => codes.every((c) => set.has(c));
    return { has, hasAny, hasAll, all: permissions };
  }, [permissions]);
}
