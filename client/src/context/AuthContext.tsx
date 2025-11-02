import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { apiRequest } from "@/lib/queryClient";

export interface User {
  id: number;
  username: string;
  email: string;
  fullName: string;
  phone?: string;
  role: string;
  emailVerified: boolean;
  mustChangePassword?: boolean;
  createdAt: string;
  updatedAt: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<{ success: boolean; message?: string; mustChangePassword?: boolean }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string, confirmPassword: string) => Promise<{ success: boolean; message?: string }>;
  setPasswordFromInvite: (token: string, password: string) => Promise<{ success: boolean; message?: string }>;
  verifyInviteToken: (token: string) => Promise<{ valid: boolean; email?: string }>;
}



const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = async () => {
    try {
      setIsLoading(true);
      const response = await apiRequest("/api/auth/me");
      
      if (response.success) {
        setUser(response.user);
      } else {
        setUser(null);
        // Clear any invalid tokens
        localStorage.removeItem('auth_token');
        document.cookie = "token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
      }
    } catch (error) {
      console.error("Failed to refresh user:", error);
      setUser(null);
      // Clear any invalid tokens
      localStorage.removeItem('auth_token');
      document.cookie = "token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, password: string, rememberMe = false) => {
    try {
      const response = await apiRequest("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password, rememberMe }),
      });

      console.log('[AUTH] Login response:', {
        success: response.success,
        hasToken: !!response.token,
        tokenLength: response.token?.length,
        hasUser: !!response.user
      });

      if (response.success) {
        // Store token in localStorage for cross-domain auth
        if (response.token) {
          localStorage.setItem('auth_token', response.token);
          console.log('[AUTH] Token stored in localStorage');
        } else {
          console.warn('[AUTH] No token in response!');
        }
        setUser(response.user);
        return {
          success: true,
          mustChangePassword: response.user?.mustChangePassword || false
        };
      } else {
        return { success: false, message: response.message };
      }
    } catch (error) {
      console.error('[AUTH] Login error:', error);
      return { success: false, message: "Login failed" };
    }
  };

  const changePassword = async (currentPassword: string, newPassword: string, confirmPassword: string) => {
    try {
      const response = await apiRequest("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });

      if (response.success) {
        // Refresh user data to update mustChangePassword status
        await refreshUser();
        return { success: true, message: response.message };
      } else {
        return { success: false, message: response.message };
      }
    } catch (error) {
      return { success: false, message: "Failed to change password" };
    }
  };

  const setPasswordFromInvite = async (token: string, password: string) => {
    try {
      const response = await apiRequest("/api/auth/set-password", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      });

      if (response.success) {
        // Store token in localStorage for cross-domain auth
        if (response.token) {
          localStorage.setItem('auth_token', response.token);
        }
        setUser(response.user);
        return { success: true };
      } else {
        return { success: false, message: response.message };
      }
    } catch (error) {
      return { success: false, message: "Password setup failed" };
    }
  };

  const verifyInviteToken = async (token: string) => {
    try {
      const response = await apiRequest(`/api/auth/verify-invite/${token}`);
      return response;
    } catch (error) {
      return { valid: false };
    }
  };

  const logout = async () => {
    try {
      await apiRequest("/api/auth/logout", { method: "POST" });
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      setUser(null);
      // Clear the auth token from localStorage
      localStorage.removeItem('auth_token');
      // Also clear any cookies
      document.cookie = "token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    }
  };

  useEffect(() => {
    refreshUser();
  }, []);

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
    refreshUser,
    changePassword,
    setPasswordFromInvite,
    verifyInviteToken,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}