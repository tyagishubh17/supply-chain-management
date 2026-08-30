import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

const NAV_BY_ROLE = {
  enterprise: [
    { to: "/enterprise-dashboard", label: "Overview" },
    { to: "/products", label: "Catalog" },
    { to: "/orders", label: "My orders" },
  ],
  vendor: [
    { to: "/orders", label: "Incoming orders" },
    { to: "/my-listings", label: "My listings" },
    { to: "/vendor-dashboard", label: "Sales summary" },
  ],
  warehouse_staff: [
    { to: "/orders", label: "Orders" },
    { to: "/warehouse-dashboard", label: "Warehouse" },
  ],
  admin: [
    { to: "/products", label: "Catalog" },
    { to: "/orders", label: "All orders" },
    { to: "/enterprise-dashboard", label: "Procurement overview" },
    { to: "/vendor-dashboard", label: "Sales summary" },
    { to: "/warehouse-dashboard", label: "Warehouse" },
  ],
};

export default function Layout() {
  const { session, logout } = useAuth();
  const navigate = useNavigate();
  const items = NAV_BY_ROLE[session?.role] || [];

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="mark">SCM // OPS</span>
          <h1>Supply Chain</h1>
        </div>
        <nav>
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => (isActive ? "active" : "")}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className="role-tag">{session?.role}</span>
          <div className="name">{session?.name}</div>
          <button className="logout-btn" onClick={handleLogout}>Log out</button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
