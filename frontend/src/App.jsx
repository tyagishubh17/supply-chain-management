import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, HOME_BY_ROLE, useAuth } from "./auth/AuthContext";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Register from "./pages/Register";
import VendorProducts from "./pages/VendorProducts";
import VendorOrders from "./pages/VendorOrders";
import VendorSales from "./pages/VendorSales";
import CustomerShop from "./pages/CustomerShop";
import CustomerOrders from "./pages/CustomerOrders";

/**
 * Only the named role may open the route. A signed-in user of the wrong
 * role is redirected to their own home rather than shown an error, so a
 * customer typing /vendor/products simply lands back in the shop.
 *
 * This is a usability guard, not the security boundary: every endpoint
 * independently checks the role carried by the JWT, so editing the URL or
 * the stored role cannot reach another role's data.
 */
function RequireRole({ role, children }) {
  const { session } = useAuth();
  if (!session) return <Navigate to="/login" replace />;
  if (session.role !== role) return <Navigate to={HOME_BY_ROLE[session.role]} replace />;
  return children;
}

/** Renders the app shell only once there is a session to render it for. */
function RequireAuth({ children }) {
  const { session } = useAuth();
  if (!session) return <Navigate to="/login" replace />;
  return children;
}

function Home() {
  const { session } = useAuth();
  return <Navigate to={HOME_BY_ROLE[session.role]} replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        <Route path="/" element={<Home />} />

        <Route
          path="/vendor/products"
          element={<RequireRole role="vendor"><VendorProducts /></RequireRole>}
        />
        <Route
          path="/vendor/orders"
          element={<RequireRole role="vendor"><VendorOrders /></RequireRole>}
        />
        <Route
          path="/vendor/sales"
          element={<RequireRole role="vendor"><VendorSales /></RequireRole>}
        />

        <Route
          path="/shop"
          element={<RequireRole role="customer"><CustomerShop /></RequireRole>}
        />
        <Route
          path="/my-orders"
          element={<RequireRole role="customer"><CustomerOrders /></RequireRole>}
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
