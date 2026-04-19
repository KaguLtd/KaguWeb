"use client";

import { AuthResponse, SessionUser } from "@kagu/contracts";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import {
  AUTH_UNAUTHORIZED_EVENT,
  apiFetch,
  registerApiAuthRefresh
} from "../lib/api";

type AuthContextValue = {
  token: string | null;
  user: SessionUser | null;
  ready: boolean;
  login: (username: string, password: string, rememberMe?: boolean) => Promise<void>;
  logout: () => void;
  replaceAuth: (response: AuthResponse) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const AUTHENTICATED_SESSION_MARKER = "cookie-session";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);

  const applyAuthState = (response: AuthResponse) => {
    setToken(AUTHENTICATED_SESSION_MARKER);
    setUser(response.user);
  };

  useEffect(() => {
    let cancelled = false;

    const clearAuthState = () => {
      if (cancelled) {
        return;
      }

      setToken(null);
      setUser(null);
    };

    const refreshSession = async () => {
      const response = await apiFetch<AuthResponse>(
        "/auth/refresh",
        {
          method: "POST",
          skipAuthRetry: true
        }
      );
      applyAuthState(response);
      return true;
    };

    registerApiAuthRefresh(refreshSession);

    const bootstrap = async () => {
      try {
        await refreshSession();
      } catch {
        clearAuthState();
      } finally {
        if (!cancelled) {
          setReady(true);
        }
      }
    };

    void bootstrap();

    const onUnauthorized = () => {
      clearAuthState();
    };

    window.addEventListener(AUTH_UNAUTHORIZED_EVENT, onUnauthorized);
    return () => {
      cancelled = true;
      registerApiAuthRefresh(null);
      window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, onUnauthorized);
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      user,
      ready,
      async login(username: string, password: string, rememberMe = true) {
        const response = await apiFetch<AuthResponse>(
          "/auth/login",
          {
            method: "POST",
            body: JSON.stringify({ username, password, rememberMe }),
            skipAuthRetry: true
          }
        );

        applyAuthState(response);
      },
      logout() {
        void apiFetch(
          "/auth/logout",
          {
            method: "POST",
            skipAuthRetry: true
          }
        ).catch(() => undefined);

        setToken(null);
        setUser(null);
      },
      replaceAuth(response: AuthResponse) {
        applyAuthState(response);
      }
    }),
    [ready, token, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
