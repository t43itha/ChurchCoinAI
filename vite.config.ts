import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// IMPORTANT: Do NOT expose backend secrets (e.g., GEMINI_API_KEY) to the browser.
// All AI calls must go through Convex actions where auth is enforced.
export default defineConfig({
  server: {
    port: 3000,
    host: "0.0.0.0",
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
