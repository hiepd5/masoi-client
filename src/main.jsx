import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import "./arcane-theme.css";
import App from "./App.jsx";
import { isNativeCapacitor } from "./config/runtimeEnv.js";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Đăng ký Service Worker Phân Tách Kép trên Production; ở DEV tự gỡ mọi SW cũ chống kẹt cache Localhost!
if (typeof window !== "undefined" && "serviceWorker" in navigator && !isNativeCapacitor()) {
  if (import.meta.env.PROD) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    });
  } else {
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => regs.forEach((r) => r.unregister().catch(() => {})))
      .catch(() => {});
  }
}
