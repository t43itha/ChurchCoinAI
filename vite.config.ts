import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// IMPORTANT: Do NOT expose backend secrets (e.g., GEMINI_API_KEY) to the browser.
// All AI calls must go through Convex actions where auth is enforced.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const requiredPublicEnvVars = [
    "VITE_CONVEX_URL",
    "VITE_CLERK_PUBLISHABLE_KEY",
  ] as const;

  const missingPublicEnvVars = requiredPublicEnvVars.filter(
    (key) => !env[key] || env[key].trim().length === 0
  );

  if (missingPublicEnvVars.length > 0) {
    throw new Error(
      `Missing required Vite environment variables: ${missingPublicEnvVars.join(", ")}`
    );
  }

  return {
    server: {
      port: 3000,
      host: "127.0.0.1",
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(moduleId) {
            if (moduleId.includes("node_modules/convex")) return "convex";
            if (moduleId.includes("node_modules/recharts")) return "charts";
            if (moduleId.includes("node_modules/framer-motion")) return "motion";
            return undefined;
          },
        },
      },
    },
    plugins: react(),
    resolve: {
      alias: {
        "@": import.meta.dirname,
      },
    },
  };
});
