import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { clearAccessToken, setAccessToken } from "../api/authTokenStore";
import { login as loginRequest, signup as signupRequest } from "../services/authService";
import { clearStoredToken, loadStoredToken, persistToken } from "./tokenStorage";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      try {
        const storedToken = await loadStoredToken();
        if (!mounted) {
          return;
        }

        if (storedToken) {
          setAccessToken(storedToken);
          setToken(storedToken);
        }
      } finally {
        if (mounted) {
          setIsBootstrapping(false);
        }
      }
    }

    bootstrap();

    return () => {
      mounted = false;
    };
  }, []);

  async function login(username, password) {
    const loginToken = await loginRequest(username, password);
    setAccessToken(loginToken);
    await persistToken(loginToken);
    setToken(loginToken);
    return loginToken;
  }

  async function signup(payload) {
    return signupRequest(payload);
  }

  async function logout() {
    clearAccessToken();
    await clearStoredToken();
    setToken(null);
  }

  const value = useMemo(
    () => ({
      token,
      isAuthenticated: Boolean(token),
      isBootstrapping,
      login,
      signup,
      logout,
    }),
    [token, isBootstrapping],
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
