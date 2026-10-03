import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

// Two roles, two navigations. A vendor is never shown a customer link and
// vice versa; the routes themselves are guarded too, so hiding a link is
// presentation, not the access control.
const NAV_BY_ROLE = {
  vendor: [
    { to: "/vendor/products", label: "My products" },
    { to: "/vendor/orders", label: "Incoming orders" },
    { to: "/vendor/sales", label: "Sales" },
  ],
  customer: [
    { to: "/shop", label: "Browse products" },
    { to: "/my-orders", label: "My orders" },
  ],
};

export default function Layout() {
  const { session, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const items = NAV_BY_ROLE[session?.role] ?? [];

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="mark">Supply Chain</span>
          <h1>{session?.role === "vendor" ? "Vendor Portal" : "Customer Portal"}</h1>
        </div>

        <nav>
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => (isActive ? "active" : "")}
              // aria-current needs a real attribute value, so it cannot be
              // derived from the className callback the way active styling is.
              aria-current={pathname === item.to ? "page" : undefined}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <span className="role-tag">{session?.role}</span>
          <div className="name">{session?.name}</div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </aside>

      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
