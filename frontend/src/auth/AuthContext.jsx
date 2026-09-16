import { createContext, useCallback, useContext, useMemo, useState } from "react";

const AuthContext = createContext(null);

const KEYS = { token: "scm_token", role: "scm_role", name: "scm_name" };

// Where each role lands after signing in.
export const HOME_BY_ROLE = {
  vendor: "/vendor/products",
  customer: "/shop",
};

function readSession() {
  const token = localStorage.getItem(KEYS.token);
  const role = localStorage.getItem(KEYS.role);
  if (!token || !(role in HOME_BY_ROLE)) return null;
  return { token, role, name: localStorage.getItem(KEYS.name) || "" };
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(readSession);

  const login = useCallback(({ access_token, role, name }) => {
    localStorage.setItem(KEYS.token, access_token);
    localStorage.setItem(KEYS.role, role);
    localStorage.setItem(KEYS.name, name);
    setSession({ token: access_token, role, name });
  }, []);

  const logout = useCallback(() => {
    // Logging out is purely client-side: the token is discarded. It carries
    // its own expiry and the server keeps no session to invalidate.
    Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
    setSession(null);
  }, []);

  const value = useMemo(() => ({ session, login, logout }), [session, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
