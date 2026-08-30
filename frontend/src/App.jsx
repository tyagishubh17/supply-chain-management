import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Products from "./pages/Products";
import Orders from "./pages/Orders";
import VendorDashboard from "./pages/VendorDashboard";
import VendorListings from "./pages/VendorListings";
import WarehouseDashboard from "./pages/WarehouseDashboard";
import EnterpriseDashboard from "./pages/EnterpriseDashboard";

const HOME_BY_ROLE = {
  enterprise: "/enterprise-dashboard",
  vendor: "/my-listings",
  warehouse_staff: "/orders",
  admin: "/enterprise-dashboard",
};

function ProtectedRoute({ children }) {
  const { session } = useAuth();
  if (!session) return <Navigate to="/login" replace />;
  return children;
}

function Home() {
  const { session } = useAuth();
  if (!session) return <Navigate to="/login" replace />;
  return <Navigate to={HOME_BY_ROLE[session.role] || "/products"} replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Home />} />
        <Route path="/products" element={<Products />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/my-listings" element={<VendorListings />} />
        <Route path="/vendor-dashboard" element={<VendorDashboard />} />
        <Route path="/enterprise-dashboard" element={<EnterpriseDashboard />} />
        <Route path="/warehouse-dashboard" element={<WarehouseDashboard />} />
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
