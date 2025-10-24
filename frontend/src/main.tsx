// import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { HeroUIProvider } from "@heroui/react";
import "./index.css";
import App from "./App.tsx";
import { AuthProvider } from "./contexts/AuthContext.tsx";
import { ToastProvider } from "./contexts/ToastContext.tsx";
import posthog from 'posthog-js';
import { PostHogProvider } from 'posthog-js/react'

posthog.init(import.meta.env.VITE_PUBLIC_POSTHOG_KEY, {
  api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
  defaults: '2025-05-24',
});

createRoot(document.getElementById("root")!).render(
  // <StrictMode>

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

  // </StrictMode>
);
