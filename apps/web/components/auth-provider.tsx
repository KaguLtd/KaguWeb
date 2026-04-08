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
  replaceAuth: (response: AuthResponse, rememberMe?: boolean) => void;
};

type StoredAuthPayload = {
  token: string;
  user: SessionUser;
  rememberMe?: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEY = "kagu.auth";
const SESSION_KEY = "kagu.auth.session";

function clearStoredAuth() {
  window.localStorage.removeItem(STORAGE_KEY);
  window.sessionStorage.removeItem(SESSION_KEY);
}

function parseJwtExp(token: string) {
  const parts = token.split(".");
  if (parts.length < 2) {
    return null;
  }

  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = `${base64}${"=".repeat((4 - (base64.length % 4)) % 4)}`;
    const payload = JSON.parse(window.atob(padded)) as { exp?: unknown };
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

function isTokenExpired(token: string) {
  const exp = parseJwtExp(token);
  if (exp === null) {
    return false;
  }
  return exp <= Math.floor(Date.now() / 1000);
}

function readStoredAuth() {
  const storage =
    window.localStorage.getItem(STORAGE_KEY) ??
    window.sessionStorage.getItem(SESSION_KEY);
  if (!storage) {
    return null;
  }

  try {
    const parsed = JSON.parse(storage) as Partial<StoredAuthPayload>;
    if (
      typeof parsed?.token === "string" &&
      parsed.user &&
      typeof parsed.user.id === "string" &&
      typeof parsed.user.username === "string" &&
      typeof parsed.user.displayName === "string" &&
      typeof parsed.user.role === "string"
    ) {
      return {
        token: parsed.token,
        user: parsed.user,
        rememberMe: parsed.rememberMe ?? window.localStorage.getItem(STORAGE_KEY) !== null
      } satisfies StoredAuthPayload;
    }
  } catch {
    // Fall through to clear corrupted storage.
  }

  clearStoredAuth();
  return null;
}

function persistAuth(payload: StoredAuthPayload) {
  const serialized = JSON.stringify(payload);
  if (payload.rememberMe) {
    window.localStorage.setItem(STORAGE_KEY, serialized);
    window.sessionStorage.removeItem(SESSION_KEY);
  } else {
    window.sessionStorage.setItem(SESSION_KEY, serialized);
    window.localStorage.removeItem(STORAGE_KEY);
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);

  const replaceAuthState = (response: AuthResponse, rememberMe = readStoredAuth()?.rememberMe ?? true) => {
    setToken(response.accessToken);
    setUser(response.user);
    persistAuth({
      token: response.accessToken,
      user: response.user,
      rememberMe
    });
  };

  useEffect(() => {
    let cancelled = false;

    const applyAuth = (response: AuthResponse, rememberMe: boolean) => {
      if (cancelled) {
        return;
      }

      setToken(response.accessToken);
      setUser(response.user);
      persistAuth({
        token: response.accessToken,
        user: response.user,
        rememberMe
      });
    };

    const clearAuthState = () => {
      if (cancelled) {
        return;
      }

      setToken(null);
      setUser(null);
      clearStoredAuth();
    };

    const refreshSession = async (preferredRememberMe?: boolean) => {
      const response = await apiFetch<AuthResponse>(
        "/auth/refresh",
        {
          method: "POST",
          skipAuthRetry: true
        }
      );
      const rememberMe = preferredRememberMe ?? readStoredAuth()?.rememberMe ?? true;
      applyAuth(response, rememberMe);
      return response.accessToken;
    };

    registerApiAuthRefresh(() => refreshSession(readStoredAuth()?.rememberMe));

    const bootstrap = async () => {
      const stored = readStoredAuth();

      if (stored && !isTokenExpired(stored.token)) {
        setToken(stored.token);
        setUser(stored.user);
        setReady(true);
        return;
      }

      if (stored) {
        clearStoredAuth();
      }

      try {
        await refreshSession(stored?.rememberMe);
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

        replaceAuthState(response, rememberMe);
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
        clearStoredAuth();
      },
      replaceAuth(response: AuthResponse, rememberMe?: boolean) {
        replaceAuthState(response, rememberMe);
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
