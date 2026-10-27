import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { isNativeCapacitor } from "./config/runtimeEnv.js";
import "./index.css";
import "./arcane-theme.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Đăng ký Service Worker Phân Tách Kép (Chốt #14: Cache-First GLB/WebP/Audio 0 MB ván 2 + Network-First HTML/JS)
if (import.meta.env.PROD && typeof window !== "undefined" && "serviceWorker" in navigator && !isNativeCapacitor()) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
