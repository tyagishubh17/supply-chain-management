import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth/AuthContext";

const ROLES = [
  { key: "enterprise", label: "Enterprise" },
  { key: "vendor", label: "Vendor" },
  { key: "warehouse_staff", label: "Warehouse" },
];

export default function Register() {
  const [role, setRole] = useState("enterprise");
  const [form, setForm] = useState({ name: "", email: "", password: "", company_name: "", address: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      let data;
      if (role === "enterprise") {
        data = await api.registerEnterprise(form);
      } else if (role === "vendor") {
        data = await api.registerVendor(form);
      } else {
        data = await api.registerStaff({ name: form.name, email: form.email, password: form.password, role: "warehouse_staff" });
      }
      login(data);
      navigate("/");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-box">
        <span className="mark">SCM // OPS</span>
        <h1>Create account</h1>

        <div className="role-switch">
          {ROLES.map((r) => (
            <button
              key={r.key}
              type="button"
              className={role === r.key ? "active" : ""}
              onClick={() => setRole(r.key)}
            >
              {r.label}
            </button>
          ))}
        </div>

        {error && <div className="error-box">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Full name</label>
            <input value={form.name} onChange={(e) => update("name", e.target.value)} required />
          </div>
          <div className="field">
            <label>Email</label>
            <input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} required />
          </div>
          <div className="field">
            <label>Password</label>
            <input type="password" value={form.password} onChange={(e) => update("password", e.target.value)} required />
          </div>
          {role !== "warehouse_staff" && (
            <>
              <div className="field">
                <label>Company name</label>
                <input value={form.company_name} onChange={(e) => update("company_name", e.target.value)} required />
              </div>
              <div className="field">
                <label>Address</label>
                <input value={form.address} onChange={(e) => update("address", e.target.value)} />
              </div>
            </>
          )}
          <button className="btn" style={{ width: "100%" }} disabled={loading}>
            {loading ? "Creating..." : "Create account"}
          </button>
        </form>
        <div className="hint">
          Already registered? <Link to="/login">Sign in</Link>
        </div>
      </div>
    </div>
  );
}
