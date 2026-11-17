import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { api, hasStoredSession, refreshSession, setSession, setSessionExpiredHandler } from '../lib/api';
import type { Role, User } from '../types/api';

interface AuthState {
  user: User | null;
  /** True while a stored session is being restored on first load. */
  restoring: boolean;
  signIn: (email: string, password: string) => Promise<User>;
  signOut: () => Promise<void>;
  hasRole: (...roles: Role[]) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [restoring, setRestoring] = useState(hasStoredSession());

  useEffect(() => {
    setSessionExpiredHandler(() => setUser(null));

    if (hasStoredSession()) {
      refreshSession()
        .then((tokens) => setUser(tokens?.user ?? null))
        .finally(() => setRestoring(false));
    }

    return () => setSessionExpiredHandler(null);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const tokens = await api.login(email, password);
    setSession(tokens);
    setUser(tokens.user);
    return tokens.user;
  }, []);

  const signOut = useCallback(async () => {
    await api.logout();
    setUser(null);
  }, []);

  const hasRole = useCallback((...roles: Role[]) => !!user && roles.includes(user.role), [user]);

  const value = useMemo(
    () => ({ user, restoring, signIn, signOut, hasRole }),
    [user, restoring, signIn, signOut, hasRole],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>.');
  return context;
}

export const STAFF_ROLES: Role[] = ['ADMIN', 'SUPPORT_AGENT'];
