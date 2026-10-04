import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

// The interface is a browser-only Vite application. The FastAPI service
// remains the only backend; no TanStack Start server is introduced.
export default defineConfig({
  plugins: [react(), tailwindcss(), tsconfigPaths()],
});
