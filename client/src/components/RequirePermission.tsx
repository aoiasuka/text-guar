import { Navigate, Outlet } from 'react-router-dom';
import { usePermission } from '@/hooks/usePermission.js';

interface Props {
  code: string;
  redirect?: string;
}

export function RequirePermission({ code, redirect = '/dashboard' }: Props) {
  const perm = usePermission();
  if (!perm.has(code)) return <Navigate to={redirect} replace />;
  return <Outlet />;
}
