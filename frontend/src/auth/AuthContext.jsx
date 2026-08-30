import { createContext, useContext, useState } from "react";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => {
    const token = localStorage.getItem("scm_token");
    const role = localStorage.getItem("scm_role");
    const name = localStorage.getItem("scm_name");
    return token ? { token, role, name } : null;
  });

  function login({ access_token, role, name }) {
    localStorage.setItem("scm_token", access_token);
    localStorage.setItem("scm_role", role);
    localStorage.setItem("scm_name", name);
    setSession({ token: access_token, role, name });
  }

  function logout() {
    localStorage.removeItem("scm_token");
    localStorage.removeItem("scm_role");
    localStorage.removeItem("scm_name");
    setSession(null);
  }

  return (
    <AuthContext.Provider value={{ session, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
