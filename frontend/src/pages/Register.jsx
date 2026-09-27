import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { HOME_BY_ROLE, useAuth } from "../auth/AuthContext";

export default function Register() {
  const [role, setRole] = useState("customer");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const isVendor = role === "vendor";

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const session = isVendor
        ? await api.registerVendor({ company_name: name, email, password })
        : await api.registerCustomer({ full_name: name, email, password });
      login(session);
      navigate(HOME_BY_ROLE[session.role], { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-box">
        <span className="mark">Supply Chain</span>
        <h1>Create an account</h1>

        <div className="role-toggle">
          <button type="button" aria-pressed={!isVendor} onClick={() => setRole("customer")}>
            Customer
          </button>
          <button type="button" aria-pressed={isVendor} onClick={() => setRole("vendor")}>
            Vendor
          </button>
        </div>

        {error && <div className="error-box">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="name">{isVendor ? "Company name" : "Full name"}</label>
            <input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              minLength={2}
              maxLength={150}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              maxLength={72}
              required
            />
          </div>
          <button className="btn" disabled={busy}>
            {busy ? "Creating account…" : `Register as ${role}`}
          </button>
        </form>

        <div className="hint">
          Already registered? <Link to="/login">Sign in</Link>
        </div>
      </div>
    </div>
  );
}
