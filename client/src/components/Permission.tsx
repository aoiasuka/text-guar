import type { ReactNode } from 'react';
import { usePermission } from '@/hooks/usePermission.js';

interface Props {
  code?: string;
  any?: string[];
  all?: string[];
  fallback?: ReactNode;
  children: ReactNode;
}

export function Permission({ code, any, all, fallback = null, children }: Props) {
  const perm = usePermission();
  const allowed =
    (!code || perm.has(code)) &&
    (!any || any.length === 0 || perm.hasAny(...any)) &&
    (!all || all.length === 0 || perm.hasAll(...all));

  if (!allowed) return <>{fallback}</>;
  return <>{children}</>;
}
