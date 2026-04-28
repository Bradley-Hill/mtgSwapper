import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { apiFetch } from "@/api/client";
import type { User, AuthContextValue } from "@/types";

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    void initializeAuth();
  }, []);
  async function initializeAuth() {
    try {
      let res = await fetch("/api/auth/me/", { credentials: "include" });

      if (res.status === 401) {
        const refreshRes = await fetch("/api/auth/refresh/", {
          method: "POST",
          credentials: "include",
        });
        if (refreshRes.ok) {
          res = await fetch("/api/auth/me/", { credentials: "include" });
        }
      }

      if (res.ok) {
        setUser((await res.json()) as User);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }

  async function login(email: string, password: string): Promise<void> {
    const res = await apiFetch("/api/auth/login/", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    const data = (await res.json()) as { user: User; message: string };
    setUser(data.user);
  }

  async function signup(
    username: string,
    email: string,
    password: string,
    inviteCode: string,
  ): Promise<void> {
    const res = await apiFetch("/api/auth/signup/", {
      method: "POST",
      body: JSON.stringify({ username, email, password, invite_code: inviteCode }),
    });
    const data = (await res.json()) as { user: User; message: string };
    setUser(data.user);
  }

  async function logout(): Promise<void> {
    try {
      await apiFetch("/api/auth/logout/", { method: "POST" });
    } finally {
      setUser(null);
    }
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
