import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";

// No head() here: the home route inherits title/description/og/twitter from
// __root.tsx, and ships no og:image so serve-time hosting can inject the
// project's social preview (explicit og:image or latest screenshot).
export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Supply Chain Management System" }, { name: "description", content: "Open your vendor or customer supply-chain workspace." }, { property: "og:title", content: "Supply Chain Management System" }, { property: "og:description", content: "Open your vendor or customer supply-chain workspace." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: Index,
});

function Index() {
  const { session, ready } = useAuth(); const navigate = useNavigate();
  useEffect(() => { if (ready) void navigate({ to: session?.role === "vendor" ? "/vendor/products" : session?.role === "customer" ? "/shop" : "/login", replace: true }); }, [ready, session, navigate]);
  return <div className="min-h-screen bg-background" />;
}
