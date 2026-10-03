import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { HOME_BY_ROLE, useAuth } from "../auth/AuthContext";

export default function Login() {
  const [role, setRole] = useState("customer");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      // The role is part of the credentials: a customer signing in through
      // the vendor tab is rejected, so the two portals stay separate.
      const session = await api.login({ email, password, role });
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
        <h1>Sign in</h1>

        <div className="role-toggle">
          <button type="button" aria-pressed={role === "customer"} onClick={() => setRole("customer")}>
            Customer
          </button>
          <button type="button" aria-pressed={role === "vendor"} onClick={() => setRole("vendor")}>
            Vendor
          </button>
        </div>

        {error && <div className="error-box" role="alert">{error}</div>}

        <form onSubmit={handleSubmit}>
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
              required
            />
          </div>
          <button className="btn" disabled={busy}>
            {busy ? "Signing in…" : `Sign in as ${role}`}
          </button>
        </form>

        <div className="hint">
          No account? <Link to="/register">Register</Link>
        </div>

        <div className="demo-note">
          Demo accounts from <code>database/seed.sql</code>, password{" "}
          <code>password123</code>
          <br />
          Vendor <code>abc@vendor.com</code> · Customer <code>rahul@customer.com</code>
        </div>
      </div>
    </div>
  );
}
