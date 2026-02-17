import path from "path";
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
          manualChunks: {
            convex: ["convex", "convex/react"],
            charts: ["recharts"],
            motion: ["framer-motion"],
          },
        },
      },
    },
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "."),
      },
    },
  };
});
