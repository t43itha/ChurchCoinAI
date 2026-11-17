import React from "react";
import ReactDOM from "react-dom/client";
import { ClerkProvider, useAuth } from "@clerk/clerk-react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ConvexReactClient } from "convex/react";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { clerkAppearance } from "./lib/clerkAppearance";
import ErrorBoundary from "./components/ErrorBoundary";
import { initializeMonitoring } from "./lib/monitoring";
import "./styles.css";

initializeMonitoring();

const convexUrl = import.meta.env.VITE_CONVEX_URL?.trim();
const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY?.trim();

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

// Clean up any previously-installed service worker. Older builds registered
// /sw.js, and stale browser caches can otherwise keep serving obsolete assets.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    const registrations = await navigator.serviceWorker.getRegistrations();
    registrations.forEach((registration) => {
      registration.unregister();
    });
  });
}

const root = ReactDOM.createRoot(rootElement);
if (!convexUrl || !clerkKey) {
  root.render(<main style={{ padding: '2rem', fontFamily: 'sans-serif' }}><h1>ChurchCoin could not start</h1><p>The site configuration is incomplete. Please contact support or try again later.</p></main>);
} else {
const convex = new ConvexReactClient(convexUrl);
root.render(
  <React.StrictMode>
    <ClerkProvider
      publishableKey={clerkKey}
      appearance={clerkAppearance}
    >
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <BrowserRouter>
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        </BrowserRouter>
      </ConvexProviderWithClerk>
    </ClerkProvider>
  </React.StrictMode>
);
}
