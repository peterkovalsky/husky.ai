// import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { HeroUIProvider } from "@heroui/react";
import "./index.css";
import App from "./App.tsx";
import { AuthProvider } from "./contexts/AuthContext.tsx";
import { ToastProvider } from "./contexts/ToastContext.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary.tsx";
import posthog from 'posthog-js';
import { PostHogProvider } from 'posthog-js/react'

// Disable PostHog on localhost
const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

posthog.init(import.meta.env.VITE_PUBLIC_POSTHOG_KEY, {
  api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
  defaults: '2025-05-24',

  // Disable on localhost
  disabled: isLocalhost,

  // Pageview and navigation tracking
  capture_pageview: true,
  capture_pageleave: true,

  // Session recording (optional - can be disabled if not needed)
  disable_session_recording: false,

  // Performance monitoring
  enable_recording_console_log: true,

  // Respect user privacy
  persistence: 'localStorage',
  autocapture: true,

  // Note: PostHog browser SDK handles uncaught exceptions automatically.
  // Our ErrorBoundary and manual error tracking provide additional coverage
  // and context beyond what automatic capture provides.
});

createRoot(document.getElementById("root")!).render(
  // <StrictMode>
  <ErrorBoundary>
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <HeroUIProvider>
            <main className="light text-foreground bg-background">
              <PostHogProvider client={posthog}>
                <App />
              </PostHogProvider>
            </main>
          </HeroUIProvider>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  </ErrorBoundary>
  // </StrictMode>
);
