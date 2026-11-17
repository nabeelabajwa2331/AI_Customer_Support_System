import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { Spinner } from '../components/Spinner';
import type { Role } from '../types/api';
import { useAuth } from './AuthContext';

interface RequireAuthProps {
  children: ReactNode;
  /** When set, other roles are sent to the assistant instead. */
  roles?: Role[];
}

export function RequireAuth({ children, roles }: RequireAuthProps) {
  const { user, restoring } = useAuth();
  const location = useLocation();

  if (restoring) {
    return (
      <div className="page-center">
        <Spinner label="Restoring your session" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  if (roles && !roles.includes(user.role)) return <Navigate to="/assistant" replace />;

  return <>{children}</>;
}
