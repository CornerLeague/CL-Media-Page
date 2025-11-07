import { createContext, useContext, useEffect, useState } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { fetchCsrf } from '@/lib/csrf';
import { getFirebaseAuth } from '@/lib/firebaseClient';
import { isBrowser } from '@/utils/env';
import { isDevHeaderAllowed, getDevUid } from '@/lib/devAuth';

interface AuthUser {
  id: string;
  username?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      // Drive auth from Firebase client state
      const auth = getFirebaseAuth();
      const firebaseUser = auth?.currentUser;
      if (firebaseUser) {
        setUser({ id: firebaseUser.uid, username: firebaseUser.email ?? undefined });
      } else {
        // Wait briefly for Firebase to load user if just signed in
        const waitedUser = await new Promise<import('firebase/auth').User | null>((resolve) => {
          try {
            const unsubscribe = (auth as any)?.onAuthStateChanged?.((u: any) => {
              try { unsubscribe(); } catch {}
              resolve(u);
            });
          } catch {
            resolve(null);
          }
        });
        if (waitedUser) {
          setUser({ id: waitedUser.uid, username: waitedUser.email ?? undefined });
        } else {
          // Dev override: if enabled and devUid is present, treat as authenticated
          try {
            if (isDevHeaderAllowed()) {
              const devUid = getDevUid();
              if (devUid) {
                setUser({ id: devUid });
              } else {
                setUser(null);
              }
            } else {
              setUser(null);
            }
          } catch {
            setUser(null);
          }
        }
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Fetch CSRF token and current user on app start
    fetchCsrf().finally(() => {
      refresh();
    });
  }, []);

  const signOut = async () => {
    try {
      // Sign out from Firebase and clear any server session cookie
      try {
        const auth = getFirebaseAuth();
        await (auth?.signOut?.() as Promise<void>);
      } catch {}
      try {
        await apiRequest('POST', '/api/auth/logout');
      } catch {}
      setUser(null);
      try {
        if (typeof window !== 'undefined') {
          window.localStorage?.removeItem?.('devUid');
        }
      } catch {}
      if (isBrowser) {
        window.location.href = '/login';
      }
    } catch (error) {
      console.error('Error signing out:', error);
      throw error;
    }
  };

  const value = {
    user,
    loading,
    refresh,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
