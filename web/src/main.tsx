import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

// The public "How it works" page loads separately, so the drive doesn't download it.
const About = lazy(() => import("./about/About"));
const onAboutPage = window.location.pathname.replace(/\/+$/, "") === "/about";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {onAboutPage ? (
      <Suspense>
        <About />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
);
