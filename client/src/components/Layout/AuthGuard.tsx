import { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/stores/useAuthStore.js';
import { authApi } from '@/services/api.js';

export function AuthGuard() {
  const token = useAuthStore((state) => state.token);
  const menus = useAuthStore((state) => state.menus);
  const updateAccess = useAuthStore((state) => state.updateAccess);
  const [bootstrapping, setBootstrapping] = useState(false);

  useEffect(() => {
    if (!token || menus.length > 0) return;
    let mounted = true;
    setBootstrapping(true);
    authApi
      .profile()
      .then((profile) => {
        if (mounted) updateAccess(profile.permissions, profile.menus);
      })
      .finally(() => mounted && setBootstrapping(false));
    return () => {
      mounted = false;
    };
  }, [token, menus.length, updateAccess]);

  if (!token) return <Navigate to="/login" replace />;
  if (bootstrapping) return null;
  return <Outlet />;
}
