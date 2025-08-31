// import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { HeroUIProvider } from "@heroui/react";
import "./index.css";
import App from "./App.tsx";
import { AuthProvider } from "./contexts/AuthContext.tsx";
import { ToastProvider } from "./contexts/ToastContext.tsx";

createRoot(document.getElementById("root")!).render(
  // <StrictMode>

  <BrowserRouter>
    <AuthProvider>
      <ToastProvider>
        <HeroUIProvider>
          <main className="light text-foreground bg-background">
            <App />
          </main>
        </HeroUIProvider>
      </ToastProvider>
    </AuthProvider>
  </BrowserRouter>

  // </StrictMode>
);
